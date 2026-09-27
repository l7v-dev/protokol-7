#!/usr/bin/env python3
"""Storage providers package initialization."""

from typing import Dict, Type
from scripts.bigdata_pipeline.storage.base import StorageProvider, StorageReceipt
from scripts.bigdata_pipeline.storage.local_cold_vault import LocalColdVaultProvider
from scripts.bigdata_pipeline.storage.cloudflare_r2 import CloudflareR2Provider

PROVIDERS: Dict[str, Type[StorageProvider]] = {
    "local_cold_vault": LocalColdVaultProvider,
    "cloudflare_r2": CloudflareR2Provider,
}


def get_storage_provider(name: str, **kwargs) -> StorageProvider:
    """Factory resolver for pluggable storage providers."""
    if name not in PROVIDERS:
        raise ValueError(f"Unknown storage provider '{name}'. Available: {list(PROVIDERS.keys())}")
    return PROVIDERS[name](**kwargs)


__all__ = [
    "StorageProvider",
    "StorageReceipt",
    "LocalColdVaultProvider",
    "CloudflareR2Provider",
    "get_storage_provider",
]
