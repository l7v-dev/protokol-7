#!/usr/bin/env python3
"""
Object Store Base Contracts and Local Storage Adapter — protokol-7

Provides Python implementations conforming to contracts/storage.ts
with atomic fsync commits, immutable conflict defense, path traversal prevention,
and ranged reads.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
import hashlib
import os
from pathlib import Path, PurePosixPath
import tempfile
from typing import Optional


@dataclass(frozen=True)
class StorageRef:
    provider_id: str
    container: str
    key: str
    version: Optional[str]
    sha256: str
    bytes: int


@dataclass(frozen=True)
class Capabilities:
    multipart: bool = False
    ranged_read: bool = True
    conditional_create: bool = True
    versioning: bool = False
    presign: bool = False
    server_side_copy: bool = False
    retention: bool = False


class BaseObjectStore(ABC):
    """Abstract base class for object store adapters."""

    @property
    @abstractmethod
    def capabilities(self) -> Capabilities:
        pass

    @abstractmethod
    def put(self, key: str, data: bytes) -> StorageRef:
        pass

    @abstractmethod
    def get(
        self,
        ref: StorageRef,
        start: Optional[int] = None,
        end: Optional[int] = None,
    ) -> bytes:
        pass

    @abstractmethod
    def head(self, ref: StorageRef) -> StorageRef:
        pass

    @abstractmethod
    def exists(self, key: str) -> bool:
        pass

    @abstractmethod
    def delete(self, ref: StorageRef) -> None:
        pass


class LocalObjectStore(BaseObjectStore):
    """
    Local filesystem object store adapter with atomic fsync,
    strict symlink and path traversal protection, and immutable conflict detection.
    """

    def __init__(
        self,
        base_dir: str,
        provider_id: str = "local",
        container: str = "pool",
    ) -> None:
        self.provider_id = provider_id
        self.container = container
        self.root = Path(base_dir).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self._capabilities = Capabilities(
            multipart=False,
            ranged_read=True,
            conditional_create=True,
            versioning=False,
            presign=False,
            server_side_copy=False,
            retention=False,
        )

    @property
    def capabilities(self) -> Capabilities:
        return self._capabilities

    def resolve_path(self, key: str) -> Path:
        """Validates key syntax and guarantees no path escapes outside base directory."""
        parts = PurePosixPath(key).parts
        if not key or key.startswith("/") or ".." in parts or "\\" in key:
            raise ValueError(f"SecurityInvariantViolation: invalid key '{key}'")

        target = self.root.joinpath(*parts)
        for node in [target, *target.parents]:
            if node == self.root:
                break
            if node.is_symlink():
                raise ValueError(f"SecurityInvariantViolation: symlink detected in '{key}'")

        if not target.resolve().is_relative_to(self.root):
            raise ValueError(f"SecurityInvariantViolation: key escapes root '{key}'")

        return target

    def put(self, key: str, data: bytes) -> StorageRef:
        target = self.resolve_path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        calculated_sha256 = hashlib.sha256(data).hexdigest()

        if target.exists():
            existing_data = target.read_bytes()
            existing_sha256 = hashlib.sha256(existing_data).hexdigest()
            if existing_sha256 != calculated_sha256:
                raise ValueError(
                    f"ImmutableConflict: key '{key}' already exists with different sha256"
                )
            return StorageRef(
                provider_id=self.provider_id,
                container=self.container,
                key=key,
                version=None,
                sha256=existing_sha256,
                bytes=len(existing_data),
            )

        fd, tmp = tempfile.mkstemp(dir=target.parent)
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(data)
                f.flush()
                os.fsync(f.fileno())

            # Atomic link or move
            try:
                os.link(tmp, target)
            except FileExistsError:
                if target.read_bytes() != data:
                    raise ValueError(
                        f"ImmutableConflict: key '{key}' created concurrently with different content"
                    )

            # Directory sync to persist directory entry metadata
            directory_fd = os.open(target.parent, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)

        return StorageRef(
            provider_id=self.provider_id,
            container=self.container,
            key=key,
            version=None,
            sha256=calculated_sha256,
            bytes=len(data),
        )

    def get(
        self,
        ref: StorageRef,
        start: Optional[int] = None,
        end: Optional[int] = None,
    ) -> bytes:
        target = self.resolve_path(ref.key)
        if not target.exists():
            raise FileNotFoundError(f"Object '{ref.key}' does not exist")
        data = target.read_bytes()
        return data[start:end]

    def head(self, ref: StorageRef) -> StorageRef:
        target = self.resolve_path(ref.key)
        if not target.exists():
            raise FileNotFoundError(f"Object '{ref.key}' does not exist")
        data = target.read_bytes()
        return StorageRef(
            provider_id=self.provider_id,
            container=self.container,
            key=ref.key,
            version=None,
            sha256=hashlib.sha256(data).hexdigest(),
            bytes=len(data),
        )

    def exists(self, key: str) -> bool:
        try:
            return self.resolve_path(key).exists()
        except ValueError:
            return False

    def delete(self, ref: StorageRef) -> None:
        target = self.resolve_path(ref.key)
        if target.exists():
            target.unlink()
