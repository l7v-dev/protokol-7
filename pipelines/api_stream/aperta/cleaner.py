#!/usr/bin/env python3
"""
Aperta Record Cleaner and Normalizer -- protokol-7

Normalizes raw metadata payloads from both OAI-PMH 2.0 and Invenio REST API
into tabular LLM-ready records with text quality metrics and file manifest summaries.
"""

import json
import os
import re
import sys
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from pipelines.shared.cleaner_base import BaseCleaner, clean_text


class ApertaCleaner(BaseCleaner):
    """
    Normalizes Aperta OAI-PMH and Invenio REST records into unified tabular structures.
    """

    def __init__(
        self,
        min_char_count: int = 15,
        min_word_count: int = 3,
        min_title_len: int = 3,
        filter_paratext: bool = True,
    ):
        super().__init__(
            min_char_count=min_char_count,
            min_word_count=min_word_count,
            filter_paratext=filter_paratext,
        )
        self.min_title_len = min_title_len

    def clean_record(self, raw_item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Dispatches to OAI or REST normalizer based on payload structure.
        """
        if not raw_item or not isinstance(raw_item, dict):
            return None

        if "dc" in raw_item and "oai_identifier" in raw_item:
            return self._clean_oai_record(raw_item)
        elif "metadata" in raw_item or "hits" in raw_item or "conceptrecid" in raw_item or "id" in raw_item:
            return self._clean_rest_record(raw_item)
        return None

    def _clean_oai_record(self, raw_oai: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        record_id = str(raw_oai.get("id") or "").strip()
        if not record_id:
            return None

        marc = raw_oai.get("marc")
        dc = raw_oai.get("dc", {})

        # Title
        titles = dc.get("title", [])
        title = clean_text(" ".join(titles)) if titles else ""
        if not title and marc and marc.get("title"):
            title = clean_text(marc["title"])

        if len(title) < self.min_title_len or (self.filter_paratext and self.is_paratext(title)):
            return None

        # Creators
        creators_list = dc.get("creator", [])
        creators = "; ".join(c.strip() for c in creators_list if c.strip())
        if not creators and marc and marc.get("creators"):
            creators = "; ".join(marc["creators"])

        # Description / Abstract
        desc_list = dc.get("description", [])
        description = clean_text("\n\n".join(desc_list)) if desc_list else ""
        if not description and marc and marc.get("description"):
            description = clean_text(marc["description"])

        # Identifiers & DOI
        identifiers = dc.get("identifier", [])
        doi = ""
        for ident in identifiers:
            ident_clean = ident.strip()
            if "doi.org/" in ident_clean:
                doi = ident_clean.split("doi.org/")[-1].strip()
            elif ident_clean.startswith("10."):
                doi = ident_clean
        if not doi and marc and marc.get("doi"):
            doi = marc["doi"]

        # Publication Date
        dates = dc.get("date", [])
        publication_date = dates[0].strip() if dates else raw_oai.get("datestamp", "")[:10]
        if (not publication_date or publication_date == raw_oai.get("datestamp", "")[:10]) and marc and marc.get("publication_date"):
            publication_date = marc["publication_date"]

        # Resource Type
        type_list = dc.get("type", [])
        resource_type = ""
        if type_list:
            raw_type = type_list[0]
            resource_type = raw_type.split("/")[-1].replace("info:eu-repo:semantics:", "")
        elif marc and marc.get("resource_types"):
            resource_type = "; ".join(marc["resource_types"])

        # Language
        lang_list = dc.get("language", [])
        language = lang_list[0].strip() if lang_list else "unknown"

        # Keywords / Subjects
        subj_list = dc.get("subject", [])
        subjects = json.dumps([s.strip() for s in subj_list if s.strip()], ensure_ascii=False)

        # Rights / License
        rights_list = dc.get("rights", [])
        rights = "; ".join(r.strip() for r in rights_list if r.strip())
        if not rights and marc and marc.get("license"):
            rights = marc["license"]

        # Publisher
        pub_list = dc.get("publisher", [])
        publisher = pub_list[0].strip() if pub_list else "TUBITAK ULAKBIM"

        # File Manifests
        files_json = "[]"
        file_count = 0
        total_file_size = 0
        if marc:
            marc_files = marc.get("files", [])
            if marc_files:
                file_count = len(marc_files)
                total_file_size = sum(f.get("size", 0) for f in marc_files)
                files_json = json.dumps(marc_files, ensure_ascii=False)

        # Text Metrics
        combined_text = f"{title} {description}".strip()
        char_count = len(combined_text)
        word_count = len(combined_text.split())


        if char_count < self.min_char_count or word_count < self.min_word_count:
            return None

        return {
            "id": record_id,
            "doi": doi,
            "title": title,
            "creators": creators,
            "description": description,
            "publisher": publisher,
            "publication_date": publication_date,
            "resource_type": resource_type,
            "language": language,
            "keywords": subjects,
            "subjects": subjects,
            "rights": rights,
            "file_count": file_count,
            "total_file_size": total_file_size,
            "files_json": files_json,
            "char_count": char_count,
            "word_count": word_count,
        }

    def _clean_rest_record(self, raw_rest: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        record_id = str(raw_rest.get("id") or "").strip()
        if not record_id:
            return None

        meta = raw_rest.get("metadata", {})

        # Title
        raw_title = meta.get("title") or raw_rest.get("title") or ""
        title = clean_text(raw_title)
        if len(title) < self.min_title_len or (self.filter_paratext and self.is_paratext(title)):
            return None

        # Creators
        creators_list = meta.get("creators", [])
        creator_names = []
        for c in creators_list:
            if isinstance(c, dict) and c.get("name"):
                creator_names.append(c["name"].strip())
            elif isinstance(c, str):
                creator_names.append(c.strip())
        creators = "; ".join(creator_names)

        # Description
        raw_desc = meta.get("description", "")
        description = clean_text(raw_desc)

        # DOI
        doi = str(meta.get("doi") or raw_rest.get("doi") or "").strip()

        # Publisher
        publisher = str(meta.get("publisher") or "TUBITAK ULAKBIM").strip()

        # Publication Date
        publication_date = str(meta.get("publication_date") or raw_rest.get("created", "")[:10]).strip()

        # Resource Type
        res_type = meta.get("resource_type", {})
        if isinstance(res_type, dict):
            resource_type = res_type.get("type") or res_type.get("title") or ""
        else:
            resource_type = str(res_type)

        # Language
        language = str(meta.get("language") or "unknown").strip()

        # Keywords
        raw_keywords = meta.get("keywords", [])
        if isinstance(raw_keywords, list):
            keywords = json.dumps([str(k).strip() for k in raw_keywords if str(k).strip()], ensure_ascii=False)
        else:
            keywords = json.dumps([str(raw_keywords).strip()], ensure_ascii=False)

        # Subjects / Science Branches
        custom = meta.get("custom", {})
        branches = custom.get("aperta:science_branches", [])
        subjects_list = []
        for b in branches:
            if isinstance(b, dict):
                title_obj = b.get("title", {})
                if isinstance(title_obj, dict):
                    for lang_key in ("tr", "en"):
                        val = title_obj.get(lang_key)
                        if val and val not in subjects_list:
                            subjects_list.append(val)
                elif isinstance(title_obj, str):
                    if title_obj not in subjects_list:
                        subjects_list.append(title_obj)
        subjects = json.dumps(subjects_list, ensure_ascii=False)

        # Rights / License
        rights = str(meta.get("license") or meta.get("access_right") or "").strip()

        # Files Manifest
        files_raw = raw_rest.get("files", [])
        parsed_files = []
        total_size = 0
        if isinstance(files_raw, list):
            for f in files_raw:
                if isinstance(f, dict):
                    file_size = int(f.get("size") or 0)
                    total_size += file_size
                    file_links = f.get("links", {})
                    download_url = file_links.get("self") if isinstance(file_links, dict) else ""
                    parsed_files.append({
                        "id": str(f.get("id") or ""),
                        "key": str(f.get("key") or ""),
                        "size": file_size,
                        "checksum": str(f.get("checksum") or ""),
                        "download_url": download_url or f"https://aperta.ulakbim.gov.tr/api/records/{record_id}/files/{f.get('key')}/content",
                    })

        files_json = json.dumps(parsed_files, ensure_ascii=False)
        file_count = len(parsed_files)

        # Text Metrics
        combined_text = f"{title} {description}".strip()
        char_count = len(combined_text)
        word_count = len(combined_text.split())

        if char_count < self.min_char_count or word_count < self.min_word_count:
            return None

        return {
            "id": record_id,
            "doi": doi,
            "title": title,
            "creators": creators,
            "description": description,
            "publisher": publisher,
            "publication_date": publication_date,
            "resource_type": resource_type,
            "language": language,
            "keywords": keywords,
            "subjects": subjects,
            "rights": rights,
            "file_count": file_count,
            "total_file_size": total_size,
            "files_json": files_json,
            "char_count": char_count,
            "word_count": word_count,
        }
