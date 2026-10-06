"""Thread-safe token receipts; prices are supplied by the caller per million tokens."""
from decimal import Decimal
from threading import RLock


class ActorTelemetry:
    def __init__(self, *, input_price=None, output_price=None):
        self.prices = tuple(None if price is None else Decimal(str(price)) for price in (input_price, output_price))
        if any(price is not None and (not price.is_finite() or price < 0) for price in self.prices):
            raise ValueError('Invalid token price')
        self._input = self._output = 0
        self._lock = RLock()

    def record(self, input_tokens=0, output_tokens=0):
        if any(type(count) is not int or count < 0 for count in (input_tokens, output_tokens)):
            raise ValueError('Token counts must be nonnegative integers')
        with self._lock:
            self._input += input_tokens
            self._output += output_tokens

    def snapshot(self):
        with self._lock:
            cost = None if None in self.prices else str((self._input * self.prices[0] + self._output * self.prices[1]) / Decimal(1_000_000))
            return {'input_tokens': self._input, 'output_tokens': self._output, 'cost': cost}
