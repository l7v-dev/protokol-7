#!/usr/bin/env python3
"""
Semantic Scholar Colab Batch OCR Engine -- protokol-7

Stage 2 & 3 of the 3-tier PDF extraction pipeline.
Processes Parquet shards where `pdf_ocr_needed == 1` using vision models on GPU.

Supported Models:
  1. baidu/Unlimited-OCR (Colab Pro / A100 GPU 40GB+):
     High-accuracy, long-horizon multi-page PDF document parsing.
     Requires: torch, transformers, pymupdf, einops, addict, easydict.
     Pinned revision: 07dea832e22aefee32ad281d4b80551282e1c168

  2. Qwen/Qwen2.5-VL-7B-Instruct (Colab Free T4 16GB GPU):
     Quantized (4-bit via bitsandbytes) vision-language document parser.
     Fits comfortably inside 16GB VRAM.

  3. Tesseract / EasyOCR (CPU fallback):
     For local CPU verification or debugging without GPU.

Architecture & Fault Tolerance:
  - Resumable: checkpoints processed paper IDs to SQLite / JSON state file.
  - Streaming Shard Processing: reads input Parquet, updates rows, writes new Parquet.
  - Rate Limiting & Backoff: gentle request pacing when fetching remote PDFs.
  - Zero-Crash: individual PDF download/OCR failures are caught and marked without aborting.

Usage (in Colab or local GPU server):
  # Auto-detect best model and process shards in a directory
  python3 colab_ocr_batch.py --input-dir /content/drive/MyDrive/SemanticScholar/Parquet \
                             --output-dir /content/drive/MyDrive/SemanticScholar/OCR_Enriched

  # Explicitly force Qwen2.5-VL-7B 4-bit on T4 GPU
  python3 colab_ocr_batch.py --model qwen --max-papers 500

  # Force baidu/Unlimited-OCR on A100 GPU
  python3 colab_ocr_batch.py --model unlimited-ocr --batch-size 8
"""

import argparse
import io
import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

USER_AGENT = "protokol-7/1.0 (+https://github.com/protokol-7; colab-batch-ocr)"
MAX_PDF_BYTES = 15 * 1024 * 1024  # 15 MB
DEFAULT_TIMEOUT = 45


# ---------------------------------------------------------------------------
# State & Checkpoint Tracker
# ---------------------------------------------------------------------------

class OcrCheckpointTracker:
    def __init__(self, db_path: str = "ocr_progress.sqlite"):
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        with self.conn:
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS completed_papers (
                    paper_id TEXT PRIMARY KEY,
                    status TEXT,
                    char_count INTEGER,
                    model TEXT,
                    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

    def is_processed(self, paper_id: str) -> bool:
        cursor = self.conn.cursor()
        cursor.execute("SELECT 1 FROM completed_papers WHERE paper_id = ?", (paper_id,))
        return cursor.fetchone() is not None

    def mark_completed(self, paper_id: str, status: str, char_count: int, model: str):
        with self.conn:
            self.conn.execute(
                "INSERT OR REPLACE INTO completed_papers (paper_id, status, char_count, model) VALUES (?, ?, ?, ?)",
                (paper_id, status, char_count, model),
            )

    def count(self) -> int:
        cursor = self.conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM completed_papers WHERE status = 'success'")
        row = cursor.fetchone()
        return row[0] if row else 0


# ---------------------------------------------------------------------------
# PDF Download & Page Rasterizer
# ---------------------------------------------------------------------------

def fetch_pdf_bytes(url: str, timeout: int = DEFAULT_TIMEOUT) -> Optional[bytes]:
    """Downloads remote PDF with size guard and timeout."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content_length = resp.headers.get("Content-Length")
            if content_length and int(content_length) > MAX_PDF_BYTES:
                return None
            data = resp.read(MAX_PDF_BYTES + 1)
            if len(data) > MAX_PDF_BYTES:
                return None
            return data
    except Exception as exc:
        print(f"[WARN] Fetch failed for {url}: {exc}", file=sys.stderr)
        return None


def rasterize_pdf_to_images(pdf_bytes: bytes, max_pages: int = 10, dpi: int = 150) -> List[Any]:
    """
    Renders PDF pages to PIL Images.
    Tries PyMuPDF (fitz) first, falls back to pypdfium2 or pdf2image.
    """
    try:
        from PIL import Image
    except ImportError:
        print("[ERROR] Pillow is required: pip install Pillow", file=sys.stderr)
        return []

    # 1. Try PyMuPDF (fitz)
    try:
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        images = []
        limit = min(len(doc), max_pages)
        zoom = dpi / 72.0
        matrix = fitz.Matrix(zoom, zoom)
        for i in range(limit):
            page = doc[i]
            pix = page.get_pixmap(matrix=matrix)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            images.append(img)
        doc.close()
        return images
    except ImportError:
        pass

    # 2. Try pypdfium2
    try:
        import pypdfium2 as pdfium
        pdf = pdfium.PdfDocument(pdf_bytes)
        images = []
        limit = min(len(pdf), max_pages)
        scale = dpi / 72.0
        for i in range(limit):
            page = pdf[i]
            bitmap = page.render(scale=scale)
            pil_image = bitmap.to_pil()
            images.append(pil_image)
        return images
    except ImportError:
        pass

    # 3. Try pdf2image
    try:
        from pdf2image import convert_from_bytes
        return convert_from_bytes(pdf_bytes, first_page=1, last_page=max_pages, dpi=dpi)
    except ImportError:
        pass

    print("[WARN] No rasterizer found! Install PyMuPDF: pip install pymupdf", file=sys.stderr)
    return []


# ---------------------------------------------------------------------------
# Vision OCR Model Adapters
# ---------------------------------------------------------------------------

class BaseOcrRunner:
    def __init__(self, name: str):
        self.name = name

    def process_images(self, images: List[Any]) -> str:
        raise NotImplementedError


class UnlimitedOcrRunner(BaseOcrRunner):
    """
    Baidu Unlimited-OCR runner for A100 GPU (40GB+).
    Uses sliding window long-horizon parsing.
    """
    def __init__(self):
        super().__init__("baidu/Unlimited-OCR")
        import torch
        from transformers import AutoModel, AutoTokenizer

        model_name = "baidu/Unlimited-OCR"
        revision = "07dea832e22aefee32ad281d4b80551282e1c168"
        print(f"[INFO] Loading {model_name} (pinned: {revision[:8]})...")

        self.tokenizer = AutoTokenizer.from_pretrained(
            model_name,
            revision=revision,
            trust_remote_code=True
        )
        self.model = AutoModel.from_pretrained(
            model_name,
            revision=revision,
            trust_remote_code=True,
            use_safetensors=True,
            torch_dtype=torch.bfloat16,
        ).eval().cuda()
        print("[OK] Unlimited-OCR loaded onto CUDA.")

    def process_images(self, images: List[Any]) -> str:
        texts = []
        import tempfile
        for idx, img in enumerate(images):
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                tmp_path = tmp.name
                img.save(tmp_path, format="PNG")

            try:
                # Unlimited-OCR single page inference
                res = self.model.infer(
                    self.tokenizer,
                    prompt="<image>document parsing.",
                    image_file=tmp_path,
                    base_size=1024,
                    image_size=640,
                    crop_mode=True,
                    max_length=4096,
                    save_results=False,
                )
                if isinstance(res, str):
                    texts.append(res.strip())
                elif isinstance(res, dict) and "text" in res:
                    texts.append(res["text"].strip())
            except Exception as e:
                print(f"[WARN] Unlimited-OCR page {idx + 1} error: {e}", file=sys.stderr)
            finally:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)

        return "\n\n".join(t for t in texts if t)


class QwenVisionRunner(BaseOcrRunner):
    """
    Qwen2.5-VL-7B-Instruct 4-bit runner for T4 GPU (16GB VRAM).
    """
    def __init__(self):
        super().__init__("Qwen/Qwen2.5-VL-7B-Instruct")
        import torch
        from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration

        model_id = "Qwen/Qwen2.5-VL-7B-Instruct"
        print(f"[INFO] Loading {model_id} (4-bit quantization on CUDA)...")

        self.processor = AutoProcessor.from_pretrained(model_id)

        try:
            from transformers import BitsAndBytesConfig
            bnb_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16,
            )
            self.model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                model_id,
                quantization_config=bnb_config,
                device_map="auto",
            )
        except Exception:
            # Fall back to bfloat16 / float16
            self.model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                model_id,
                torch_dtype=torch.float16,
                device_map="auto",
            )

        print("[OK] Qwen2.5-VL loaded successfully.")

    def process_images(self, images: List[Any]) -> str:
        texts = []
        for idx, img in enumerate(images):
            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "image": img},
                        {
                            "type": "text",
                            "text": (
                                "Transcribe all text, headings, and tabular contents from this document page "
                                "into clean Markdown format. Preserve reading order and structure."
                            ),
                        },
                    ],
                }
            ]
            prompt = self.processor.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True
            )
            inputs = self.processor(
                text=[prompt],
                images=[img],
                padding=True,
                return_tensors="pt"
            ).to("cuda")

            import torch
            with torch.no_grad():
                generated_ids = self.model.generate(**inputs, max_new_tokens=1536)

            generated_ids_trimmed = [
                out_ids[len(in_ids):]
                for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
            ]
            output_text = self.processor.batch_decode(
                generated_ids_trimmed,
                skip_special_tokens=True,
                clean_up_tokenization_spaces=False
            )[0]

            if output_text.strip():
                texts.append(output_text.strip())

        return "\n\n".join(texts)


class TesseractFallbackRunner(BaseOcrRunner):
    """CPU fallback using pytesseract for environments without GPU."""
    def __init__(self):
        super().__init__("Tesseract-OCR")
        import pytesseract
        self.pytesseract = pytesseract
        print("[INFO] Initialized Tesseract CPU fallback runner.")

    def process_images(self, images: List[Any]) -> str:
        pages = []
        for img in images:
            txt = self.pytesseract.image_to_string(img)
            if txt.strip():
                pages.append(txt.strip())
        return "\n\n".join(pages)


def create_ocr_runner(model_choice: str = "auto") -> BaseOcrRunner:
    """Detects available hardware and initializes optimal OCR engine."""
    import torch
    has_cuda = torch.cuda.is_available()

    if model_choice == "unlimited-ocr":
        return UnlimitedOcrRunner()
    elif model_choice == "qwen":
        return QwenVisionRunner()
    elif model_choice == "tesseract":
        return TesseractFallbackRunner()

    # Auto-detection mode
    if has_cuda:
        gpu_name = torch.cuda.get_device_name(0).lower()
        vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        print(f"[DETECT] Found GPU: {gpu_name} ({vram_gb:.1f} GB VRAM)")

        if vram_gb >= 38.0:
            print("[DETECT] VRAM >= 38GB -> Selecting baidu/Unlimited-OCR")
            try:
                return UnlimitedOcrRunner()
            except Exception as exc:
                print(f"[WARN] Failed to init Unlimited-OCR ({exc}), trying Qwen...", file=sys.stderr)
                return QwenVisionRunner()
        else:
            print("[DETECT] VRAM < 38GB (T4 / V100) -> Selecting Qwen2.5-VL 4-bit")
            return QwenVisionRunner()

    print("[DETECT] No CUDA GPU found -> Using Tesseract CPU fallback")
    return TesseractFallbackRunner()


# ---------------------------------------------------------------------------
# Parquet Batch Processor
# ---------------------------------------------------------------------------

def process_parquet_shard(
    input_path: str,
    output_path: str,
    runner: BaseOcrRunner,
    tracker: OcrCheckpointTracker,
    max_papers: int = 0,
) -> Tuple[int, int, int]:
    """
    Reads a Parquet shard, finds rows needing OCR, processes them,
    and writes the updated shard to output_path.
    """
    import pyarrow as pa
    import pyarrow.parquet as pq

    table = pq.read_table(input_path)
    df = table.to_pandas()

    if "pdf_ocr_needed" not in df.columns:
        print(f"[SKIP] Shard {os.path.basename(input_path)} has no pdf_ocr_needed column.")
        return 0, 0, 0

    total_candidates = (df["pdf_ocr_needed"] == 1).sum()
    print(f"[SHARD] {os.path.basename(input_path)}: {len(df)} total papers, {total_candidates} need OCR.")

    processed = 0
    succeeded = 0
    skipped = 0

    for idx, row in df.iterrows():
        if max_papers and processed >= max_papers:
            break

        paper_id = str(row["paper_id"])
        needs_ocr = row.get("pdf_ocr_needed") == 1
        pdf_url = str(row.get("oa_pdf_url") or "")

        if not needs_ocr or not pdf_url:
            continue

        if tracker.is_processed(paper_id):
            skipped += 1
            continue

        print(f"[{processed + 1}/{total_candidates}] Processing paper {paper_id}...")
        pdf_bytes = fetch_pdf_bytes(pdf_url)
        if not pdf_bytes:
            tracker.mark_completed(paper_id, "download_failed", 0, runner.name)
            processed += 1
            continue

        images = rasterize_pdf_to_images(pdf_bytes, max_pages=10)
        if not images:
            tracker.mark_completed(paper_id, "rasterize_failed", 0, runner.name)
            processed += 1
            continue

        try:
            ocr_text = runner.process_images(images)
            char_count = len(ocr_text)

            if char_count > 100:
                df.at[idx, "pdf_text"] = ocr_text
                df.at[idx, "pdf_ocr_needed"] = 0
                df.at[idx, "pdf_char_count"] = char_count
                tracker.mark_completed(paper_id, "success", char_count, runner.name)
                succeeded += 1
                print(f"    [OK] Extracted {char_count} chars.")
            else:
                tracker.mark_completed(paper_id, "insufficient_text", char_count, runner.name)
                print(f"    [WARN] Insufficient text extracted ({char_count} chars).")
        except Exception as ocr_err:
            print(f"    [FAIL] OCR error for {paper_id}: {ocr_err}", file=sys.stderr)
            tracker.mark_completed(paper_id, "ocr_error", 0, runner.name)

        processed += 1
        time.sleep(0.5)  # Politeness delay

    # Save updated Parquet shard
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    updated_table = pa.Table.from_pandas(df, schema=table.schema)
    pq.write_table(updated_table, output_path, compression="zstd")
    print(f"[SAVED] Shard saved to {output_path} ({succeeded} papers OCR-enriched).")

    return processed, succeeded, skipped


def main():
    parser = argparse.ArgumentParser(description="Semantic Scholar Colab Batch OCR Engine")
    parser.add_argument("--input-dir", type=str, default="data/temp_semanticscholar", help="Directory containing Parquet shards")
    parser.add_argument("--output-dir", type=str, default="data/ocr_semanticscholar", help="Output directory for enriched shards")
    parser.add_argument("--model", type=str, choices=["auto", "unlimited-ocr", "qwen", "tesseract"], default="auto", help="OCR model")
    parser.add_argument("--max-papers", type=int, default=0, help="Maximum papers to process (0 = all)")
    args = parser.parse_args()

    tracker = OcrCheckpointTracker()
    print(f"[INIT] Loaded checkpoint tracker ({tracker.count()} completed papers in DB).")

    runner = create_ocr_runner(args.model)

    shards = [
        f for f in os.listdir(args.input_dir)
        if f.endswith(".parquet") and not f.startswith(".")
    ]
    shards.sort()

    if not shards:
        print(f"[INFO] No .parquet files found in {args.input_dir}")
        return

    print(f"[START] Found {len(shards)} Parquet shards in {args.input_dir}")
    total_p, total_s, total_sk = 0, 0, 0

    for shard_file in shards:
        in_p = os.path.join(args.input_dir, shard_file)
        out_p = os.path.join(args.output_dir, shard_file)
        p, s, sk = process_parquet_shard(
            in_p, out_p, runner, tracker, max_papers=args.max_papers
        )
        total_p += p
        total_s += s
        total_sk += sk

    print(
        f"\n[COMPLETE] Batch OCR finished:\n"
        f"  Total Processed: {total_p}\n"
        f"  Succeeded      : {total_s}\n"
        f"  Skipped (prior): {total_sk}\n"
    )


if __name__ == "__main__":
    main()
