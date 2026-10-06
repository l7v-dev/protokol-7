"""Cache access policy; BYPASS requests a fresh result without storing it."""
from enum import Enum


class CacheMode(str, Enum):
    ENABLED = 'enabled'
    DISABLED = 'disabled'
    READ_ONLY = 'read_only'
    WRITE_ONLY = 'write_only'
    BYPASS = 'bypass'

    @property
    def can_read(self):
        return self in (self.ENABLED, self.READ_ONLY)

    @property
    def can_write(self):
        return self in (self.ENABLED, self.WRITE_ONLY)
