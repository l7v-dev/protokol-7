"""Versioned 64-bit word-trigram SimHash and bounded local similarity cache."""
from collections import OrderedDict
from threading import RLock
import re
import unicodedata

SIMHASH_VERSION = 'nfkc-fnv1a64-word3-v1'


def content_fingerprint(text: str) -> str:
    words = re.sub(r'[^\w\s]|_', '', unicodedata.normalize('NFKC', text).lower()).split()
    if not words:
        raise ValueError("Empty content has no similarity fingerprint")
    tokens = words if len(words) < 3 else [' '.join(words[index:index + 3]) for index in range(len(words) - 2)]
    vector = [0] * 64
    for token in tokens:
        fingerprint = 0xcbf29ce484222325
        # Match the existing TypeScript token hash over UTF-16 code units.
        encoded = token.encode('utf-16-le')
        for index in range(0, len(encoded), 2):
            fingerprint ^= int.from_bytes(encoded[index:index + 2], 'little')
            fingerprint = fingerprint * 0x100000001b3 & ((1 << 64) - 1)
        for bit in range(64):
            vector[bit] += 1 if fingerprint >> bit & 1 else -1
    return f'{sum(1 << bit for bit, weight in enumerate(vector) if weight > 0):016x}'


class Simhash:
    def __init__(self, text: str):
        self.value = int(content_fingerprint(text), 16)

    def similarity(self, other):
        return 1 - (self.value ^ other.value).bit_count() / 64


class LRUSimhashCache:
    """Similarity scope is the most recent capacity entries in this process."""
    def __init__(self, capacity=10000):
        if isinstance(capacity, bool) or not isinstance(capacity, int) or capacity < 1:
            raise ValueError("capacity must be a positive integer")
        self.capacity = capacity
        self._entries = OrderedDict()
        self._lock = RLock()

    def is_near_duplicate(self, text, threshold=.9):
        if not 0 <= threshold <= 1:
            raise ValueError("threshold must be between zero and one")
        candidate = Simhash(text).value
        with self._lock:
            matching = next((value for value in reversed(self._entries)
                             if 1 - (candidate ^ value).bit_count() / 64 >= threshold), None)
            if matching is not None:
                self._entries.move_to_end(matching)
            self._entries[candidate] = None
            self._entries.move_to_end(candidate)
            while len(self._entries) > self.capacity:
                self._entries.popitem(last=False)
            return matching is not None
