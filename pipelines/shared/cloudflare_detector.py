"""Recognize challenge markup without interpreting it as source records."""
from html.parser import HTMLParser


class ChallengeError(ValueError):
    """A challenge response cannot be consumed as source content."""


class _ChallengeParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.kind = None
        self.in_title = False
        self.title = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag.lower() == "title":
            self.in_title = True
        if attributes.get("name") == "cf-turnstile-response" or attributes.get("id") == "turnstile-wrapper":
            self.kind = "turnstile"
        elif self.kind != "turnstile" and (attributes.get("id") in {"cf-challenge-running", "cf-please-wait", "challenge-spinner"}
                                             or "cf-turnstile" in attributes.get("class", "").split()):
            self.kind = "js"

    def handle_endtag(self, tag):
        if tag.lower() == "title":
            self.in_title = False

    def handle_data(self, text):
        if self.in_title:
            self.title.append(text)


def challenge_type(html: str) -> str | None:
    parser = _ChallengeParser()
    parser.feed(html)
    title = "".join(parser.title).strip().lower()
    if parser.kind:
        return parser.kind
    if title in {"just a moment...", "ddos-guard"}:
        return "js"
    if title in {"access denied", "attention required! | cloudflare"}:
        return "access_denied"
    return None


def is_cloudflare_challenge(html: str) -> bool:
    return challenge_type(html) is not None


def reject_challenge(payload: bytes) -> None:
    if is_cloudflare_challenge(payload.decode("utf-8", errors="replace")):
        raise ChallengeError("HTTP response contains challenge markup")
