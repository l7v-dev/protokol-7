/**
 * PDF Rasterizer engine.
 * Converts PDF pages into high-resolution PNG image buffers.
 * Leverages BrowserPool (Playwright Chromium) with isolated HTML canvas rendering
 * and unpdf embedded image extraction without external native C/Cairo dependencies.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { extractImages, getDocumentProxy } from "unpdf";
import { BrowserPool } from "../browser/browser-pool";

export interface PdfRasterizerOptions {
  scale?: number;
  maxPages?: number;
  timeoutMs?: number;
}

export class PdfRasterizer {
  private static cachedPdfJsCode: string | null = null;

  private static getPdfJsSource(): string {
    if (!this.cachedPdfJsCode) {
      const unpdfDir = path.dirname(require.resolve("unpdf"));
      const pdfJsPath = path.join(unpdfDir, "pdfjs.mjs");
      this.cachedPdfJsCode = fs.readFileSync(pdfJsPath, "utf8");
    }
    return this.cachedPdfJsCode;
  }

  private static toPureUint8Array(input: Buffer | Uint8Array): Uint8Array {
    if (Buffer.isBuffer(input)) {
      return new Uint8Array(
        input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
      );
    }
    return input;
  }

  /**
   * Extracts embedded raster images directly from a PDF page if present.
   */
  public static async extractEmbeddedImages(
    pdfBuffer: Buffer | Uint8Array,
    pageNumber = 1
  ): Promise<Buffer[]> {
    const uint8Data = this.toPureUint8Array(pdfBuffer);
    try {
      const rawImages = await extractImages(uint8Data, pageNumber);
      return rawImages.map((img) => Buffer.from(img));
    } catch {
      return [];
    }
  }

  /**
   * Renders a specific PDF page to a PNG Buffer via BrowserPool canvas.
   */
  public static async rasterizePage(
    pdfBuffer: Buffer | Uint8Array,
    pageNumber = 1,
    scale = 1.5,
    timeoutMs = 15000
  ): Promise<Buffer> {
    const results = await this.rasterizePages(pdfBuffer, [pageNumber], scale, timeoutMs);
    if (!results[0]) {
      throw new Error(`Failed to rasterize PDF page ${pageNumber}.`);
    }
    return results[0];
  }

  /**
   * Renders all or up to maxPages of a PDF document to PNG Buffers.
   */
  public static async rasterizeAllPages(
    pdfBuffer: Buffer | Uint8Array,
    options?: PdfRasterizerOptions
  ): Promise<Buffer[]> {
    const uint8Data = this.toPureUint8Array(pdfBuffer);
    const doc = await getDocumentProxy(uint8Data);
    const totalPages = doc.numPages;
    const limit =
      options?.maxPages && options.maxPages > 0
        ? Math.min(options.maxPages, totalPages)
        : totalPages;

    const pageNumbers = Array.from({ length: limit }, (_, i) => i + 1);
    return this.rasterizePages(
      pdfBuffer,
      pageNumbers,
      options?.scale ?? 1.5,
      options?.timeoutMs ?? 20000
    );
  }

  /**
   * Internal multi-page canvas rasterizer using a single pooled browser session.
   */
  private static async rasterizePages(
    pdfBuffer: Buffer | Uint8Array,
    pageNumbers: number[],
    scale: number,
    timeoutMs: number
  ): Promise<Buffer[]> {
    const pdfJsCode = this.getPdfJsSource();
    const pdfBase64 = Buffer.from(pdfBuffer).toString("base64");

    const session = await BrowserPool.acquireSession({
      allowLocalNetwork: true,
      blockAssets: false,
      timeoutMs,
    });

    try {
      const page = session.page;

      // Intercept local mock origins to serve pdfjs module and rendering canvas
      await page.route("http://rasterizer.local/pdfjs.mjs", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: pdfJsCode,
        });
      });

      await page.route("http://rasterizer.local/", (route) => {
        route.fulfill({
          status: 200,
          contentType: "text/html",
          body: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
  <canvas id="pdf-canvas"></canvas>
  <script type="module">
    import * as pdfjs from "/pdfjs.mjs";
    window.pdfjs = pdfjs;
    window.isReady = true;
  </script>
</body>
</html>`,
        });
      });

      await page.goto("http://rasterizer.local/", {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
      await page.waitForFunction(
        () => (window as unknown as { isReady: boolean }).isReady === true,
        null,
        {
          timeout: timeoutMs,
        }
      );

      const renderedBuffers: Buffer[] = [];

      for (const pageNum of pageNumbers) {
        const dataUrl = await page.evaluate(
          async ({ base64, pageNumber, renderScale }) => {
            const win = window as unknown as {
              pdfjs: {
                getDocument: (params: { data: Uint8Array }) => {
                  promise: Promise<{
                    getPage: (num: number) => Promise<{
                      getViewport: (opts: { scale: number }) => { width: number; height: number };
                      render: (opts: {
                        canvasContext: CanvasRenderingContext2D | null;
                        viewport: unknown;
                      }) => {
                        promise: Promise<void>;
                      };
                    }>;
                  }>;
                };
              };
            };

            const raw = atob(base64);
            const bytes = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) {
              bytes[i] = raw.charCodeAt(i);
            }

            const doc = await win.pdfjs.getDocument({ data: bytes }).promise;
            const pageObj = await doc.getPage(pageNumber);
            const viewport = pageObj.getViewport({ scale: renderScale });

            const canvas = document.getElementById("pdf-canvas") as HTMLCanvasElement;
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext("2d");

            await pageObj.render({ canvasContext: ctx, viewport }).promise;
            return canvas.toDataURL("image/png");
          },
          { base64: pdfBase64, pageNumber: pageNum, renderScale: scale }
        );

        const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
        renderedBuffers.push(Buffer.from(base64Data, "base64"));
      }

      return renderedBuffers;
    } finally {
      await session.release();
    }
  }
}
