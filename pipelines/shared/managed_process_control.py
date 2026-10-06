"""Authenticated fixed-frame control over an inherited Unix socket pair."""
import hashlib
import hmac
import os
import secrets
import select
import socket
from threading import Event, Thread

FD_ENV = 'PROTOKOL_CONTROL_FD'
KEY_ENV = 'PROTOKOL_CONTROL_KEY'


def _frame(message, key):
    return message + hmac.digest(key, message, hashlib.sha256)


class ManagedProcessControl:
    def __init__(self):
        self.parent, self.child = socket.socketpair()
        self.parent.settimeout(1)
        self.key = secrets.token_bytes(32)
        self._stop = Event()
        self._thread = None
        self._ready = False
        self._buffer = b''

    @classmethod
    def create(cls):
        return cls()

    def child_env(self):
        return {FD_ENV: str(self.child.fileno()), KEY_ENV: self.key.hex()}

    def release_child(self):
        self.child.close()

    def start(self):
        def pump():
            while not self._stop.is_set():
                try:
                    self.parent.sendall(_frame(b'HB', self.key))
                except OSError:
                    return
                self._stop.wait(.25)
        self._thread = Thread(target=pump, name='process-control', daemon=True)
        self._thread.start()

    def is_ready(self):
        if self._ready:
            return True
        if select.select([self.parent], [], [], 0)[0]:
            received = self.parent.recv(34 - len(self._buffer))
            self._buffer += received
            if len(self._buffer) == 34:
                self._ready = hmac.compare_digest(self._buffer, _frame(b'RD', self.key))
        return self._ready

    def close(self):
        self._stop.set()
        try:
            self.parent.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        if self._thread:
            self._thread.join(2)
        self.parent.close()
        self.child.close()


class ManagedProcessControlWatcher:
    def __init__(self, channel, key, on_shutdown):
        self.channel, self.key, self.on_shutdown = channel, key, on_shutdown
        self.channel.settimeout(10)
        self._stop = Event()
        self._thread = None

    @classmethod
    def from_environment(cls, on_shutdown):
        fd = os.environ.pop(FD_ENV, None)
        key = os.environ.pop(KEY_ENV, None)
        if fd is None and key is None:
            return None
        if fd is None or key is None or len(key) != 64:
            raise ValueError('Incomplete process control environment')
        decoded_key = bytes.fromhex(key)
        channel = socket.socket(fileno=int(fd))
        os.set_inheritable(channel.fileno(), False)
        return cls(channel, decoded_key, on_shutdown)

    def start(self):
        self.channel.sendall(_frame(b'RD', self.key))
        def watch():
            pending = b''
            try:
                while not self._stop.is_set():
                    received = self.channel.recv(34 - len(pending))
                    if not received:
                        break
                    pending += received
                    if len(pending) == 34:
                        if not hmac.compare_digest(pending, _frame(b'HB', self.key)):
                            break
                        pending = b''
            except OSError:
                pass
            if not self._stop.is_set():
                self.on_shutdown()
        self._thread = Thread(target=watch, name='process-control-watcher', daemon=True)
        self._thread.start()

    def close(self):
        self._stop.set()
        try:
            self.channel.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        if self._thread:
            self._thread.join(3)
        self.channel.close()
