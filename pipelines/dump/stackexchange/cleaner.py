#!/usr/bin/env python3
"""
StackExchange XML Parser & Thread Assembler -- protokol-7

Parses Posts.xml and (optionally) Comments.xml from a SE data dump,
assembles complete Q&A threads, and cleans HTML body text into plain text.

Output format (one dict per accepted-answer thread):
  {
    "thread_id":      int,      # question PostId
    "site":           str,      # e.g. "stackoverflow"
    "title":          str,      # question title
    "tags":           str,      # semicolon-joined tag list
    "score":          int,      # question score
    "view_count":     int,
    "question":       str,      # cleaned question body
    "answer":         str,      # cleaned accepted/top answer body
    "answer_score":   int,
    "comments":       str,      # pipe-joined top comments (optional)
    "creation_date":  str,
    "answer_count":   int,
  }

Questions without any answer are excluded. For questions without an
accepted answer, the highest-scored answer (score >= MIN_ANSWER_SCORE) is used.

Cleaning pipeline per body:
  1. html.parser via html.parser (stdlib) -> strip tags
  2. Decode HTML entities
  3. Collapse whitespace
  4. Preserve code blocks as inline indented text (4-space)
"""

import html
import re
import xml.etree.ElementTree as ET
from typing import Dict, Any, Iterator, Optional, List, Tuple

MIN_ANSWER_SCORE  = 1   # minimum answer score to include if no accepted answer
MIN_BODY_TOKENS   = 20  # minimum token count for question or answer body
MAX_COMMENT_CHARS = 500 # max characters per comment

# ------------------------------------------------------------------
# HTML -> plain text
# ------------------------------------------------------------------

_RE_CODE_BLOCK  = re.compile(r"<pre[^>]*><code[^>]*>(.*?)</code></pre>", re.DOTALL | re.IGNORECASE)
_RE_INLINE_CODE = re.compile(r"<code[^>]*>(.*?)</code>", re.DOTALL | re.IGNORECASE)
_RE_LIST_ITEM   = re.compile(r"<li[^>]*>(.*?)</li>", re.DOTALL | re.IGNORECASE)
_RE_BR          = re.compile(r"<br\s*/?>", re.IGNORECASE)
_RE_P_TAG       = re.compile(r"</p>|<p[^>]*>", re.IGNORECASE)
_RE_H_TAG       = re.compile(r"<h[1-6][^>]*>(.*?)</h[1-6]>", re.DOTALL | re.IGNORECASE)
_RE_ALL_TAGS    = re.compile(r"<[^>]{1,200}>")
_RE_MULTI_NL    = re.compile(r"\n{3,}")
_RE_MULTI_SPACE = re.compile(r"[ \t]{2,}")


def _html_to_text(raw_html: str) -> str:
    """Converts SE HTML body to readable plain text, preserving code blocks."""
    if not raw_html:
        return ""

    text = raw_html

    # 1. Preserve code blocks with indentation
    def replace_code_block(m: re.Match) -> str:
        code = html.unescape(m.group(1)).strip()
        indented = "\n".join("    " + ln for ln in code.splitlines())
        return f"\n\n{indented}\n\n"

    text = _RE_CODE_BLOCK.sub(replace_code_block, text)

    # 2. Inline code -> backtick
    text = _RE_INLINE_CODE.sub(lambda m: f"`{html.unescape(m.group(1)).strip()}`", text)

    # 3. List items -> bullet
    text = _RE_LIST_ITEM.sub(lambda m: f"\n- {m.group(1).strip()}", text)

    # 4. Headings -> ## heading
    text = _RE_H_TAG.sub(lambda m: f"\n## {m.group(1).strip()}\n", text)

    # 5. <br> and </p> -> newline
    text = _RE_BR.sub("\n", text)
    text = _RE_P_TAG.sub("\n", text)

    # 6. Strip remaining HTML tags
    text = _RE_ALL_TAGS.sub("", text)

    # 7. Decode HTML entities
    text = html.unescape(text)

    # 8. Normalise whitespace
    lines = [_RE_MULTI_SPACE.sub(" ", ln.rstrip()) for ln in text.splitlines()]
    text  = "\n".join(lines)
    text  = _RE_MULTI_NL.sub("\n\n", text).strip()

    return text


# ------------------------------------------------------------------
# Posts.xml parser
# ------------------------------------------------------------------

def _parse_posts_xml(posts_path: str) -> Tuple[Dict[int, Dict], Dict[int, List[Dict]]]:
    """
    Single-pass parse of Posts.xml.
    Returns:
      questions: {question_id: post_dict}
      answers:   {question_id: [answer_dict, ...]}  (sorted by score desc)
    """
    questions: Dict[int, Dict] = {}
    answers:   Dict[int, List[Dict]] = {}

    context = ET.iterparse(posts_path, events=("end",))
    for _, elem in context:
        if elem.tag != "row":
            elem.clear()
            continue

        post_type = elem.get("PostTypeId", "")
        pid       = int(elem.get("Id", 0))

        if post_type == "1":  # question
            questions[pid] = {
                "id":              pid,
                "title":           elem.get("Title", ""),
                "body":            elem.get("Body", ""),
                "score":           int(elem.get("Score", 0)),
                "view_count":      int(elem.get("ViewCount", 0)),
                "accepted_answer": int(elem.get("AcceptedAnswerId", 0) or 0),
                "answer_count":    int(elem.get("AnswerCount", 0)),
                "tags":            elem.get("Tags", "").replace("><", ";").strip("<>"),
                "creation_date":   elem.get("CreationDate", ""),
            }
        elif post_type == "2":  # answer
            parent_id = int(elem.get("ParentId", 0))
            if parent_id not in answers:
                answers[parent_id] = []
            answers[parent_id].append({
                "id":    pid,
                "body":  elem.get("Body", ""),
                "score": int(elem.get("Score", 0)),
            })

        elem.clear()

    # Sort answers per question by score descending
    for qid in answers:
        answers[qid].sort(key=lambda a: a["score"], reverse=True)

    return questions, answers


def _parse_comments_xml(comments_path: str) -> Dict[int, List[str]]:
    """
    Parses Comments.xml, returns {post_id: [comment_text, ...]} (top 3 per post).
    """
    raw: Dict[int, List[Tuple[int, str]]] = {}

    context = ET.iterparse(comments_path, events=("end",))
    for _, elem in context:
        if elem.tag != "row":
            elem.clear()
            continue
        pid   = int(elem.get("PostId", 0))
        score = int(elem.get("Score", 0))
        text  = elem.get("Text", "")
        if text and pid:
            if pid not in raw:
                raw[pid] = []
            raw[pid].append((score, text))
        elem.clear()

    # Keep top-3 comments by score per post
    result: Dict[int, List[str]] = {}
    for pid, entries in raw.items():
        entries.sort(reverse=True)
        result[pid] = [t[:MAX_COMMENT_CHARS] for _, t in entries[:3]]
    return result


def stream_threads(
    posts_path: str,
    comments_path: Optional[str] = None,
    site: str = "unknown",
) -> Iterator[Dict[str, Any]]:
    """
    Assembles and yields cleaned Q&A thread dicts.
    Skips questions with no usable answer.
    """
    questions, answers = _parse_posts_xml(posts_path)
    comments: Dict[int, List[str]] = {}
    if comments_path and __import__("os").path.exists(comments_path):
        comments = _parse_comments_xml(comments_path)

    for qid, q in questions.items():
        qid_answers = answers.get(qid, [])
        if not qid_answers:
            continue

        # Pick best answer: accepted first, then highest score
        accepted_id = q["accepted_answer"]
        best_answer: Optional[Dict] = None
        if accepted_id:
            for a in qid_answers:
                if a["id"] == accepted_id:
                    best_answer = a
                    break
        if best_answer is None:
            top = qid_answers[0]
            if top["score"] >= MIN_ANSWER_SCORE:
                best_answer = top

        if best_answer is None:
            continue

        # Clean bodies
        q_text = _html_to_text(q["body"])
        a_text = _html_to_text(best_answer["body"])

        # Quality gate
        if len(q_text.split()) < MIN_BODY_TOKENS or len(a_text.split()) < MIN_BODY_TOKENS:
            continue

        # Collect comments for this question and its best answer
        combined_comments: List[str] = (
            comments.get(qid, []) + comments.get(best_answer["id"], [])
        )[:5]
        comments_str = " | ".join(combined_comments) if combined_comments else ""

        yield {
            "thread_id":     qid,
            "site":          site,
            "title":         q["title"],
            "tags":          q["tags"],
            "score":         q["score"],
            "view_count":    q["view_count"],
            "question":      q_text,
            "answer":        a_text,
            "answer_score":  best_answer["score"],
            "comments":      comments_str,
            "creation_date": q["creation_date"],
            "answer_count":  q["answer_count"],
        }
