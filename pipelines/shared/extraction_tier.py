"""Select a configured extraction tier from byte size and caller-supplied costs."""
from enum import Enum
import math


class ExtractionTier(str, Enum):
    TEXT = 'text'
    OCR = 'ocr'
    FULL = 'full'


def select_tier(size, budget, *, costs=None, text_limit=10_000_000, ocr_limit=100_000_000):
    if type(size) is not int or size < 0 or not math.isfinite(budget) or budget < 0:
        raise ValueError('Invalid size or budget')
    if not 0 <= text_limit <= ocr_limit:
        raise ValueError('Invalid size thresholds')
    required = ExtractionTier.TEXT if size <= text_limit else ExtractionTier.OCR if size <= ocr_limit else ExtractionTier.FULL
    # Only TEXT is available unless the caller explicitly registers another tier.
    prices = {ExtractionTier.TEXT: 0} if costs is None else costs
    if any(not math.isfinite(price) or price < 0 for price in prices.values()):
        raise ValueError('Invalid tier cost')
    if required not in prices:
        raise ValueError(f'Extraction tier is unavailable: {required.value}')
    if prices[required] > budget:
        raise ValueError('Extraction budget is insufficient')
    return required
