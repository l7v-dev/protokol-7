"""Pinned-origin OpenAlex delta client with bounded requests, bytes and elapsed time."""

import http.client
import json
import socket
import threading
import time
import urllib.parse


class DeltaError(RuntimeError):
    pass


class DeltaClient:
    def __init__(self, api_key, max_requests=10, max_bytes=10 * 1024**2, max_seconds=300):
        if not api_key or any(c in api_key for c in "\r\n"):
            raise DeltaError("API key required. Configure paid sync access.")
        if min(max_requests, max_bytes, max_seconds) <= 0:
            raise ValueError("Budgets must be positive")
        self.api_key = api_key
        self.max_requests, self.max_bytes = max_requests, max_bytes
        self.deadline = time.monotonic() + max_seconds
        self.requests = self.bytes_read = 0

    def fetch_page(self, window):
        query = urllib.parse.urlencode({
            "filter": f"from_updated_date:{window['from']},to_updated_date:{window['to']}",
            "select": "id,updated_date,display_name,doi,language,type",
            "per_page": 100, "cursor": window["cursor"],
        })
        for attempt in range(3):
            remaining_seconds = self.deadline - time.monotonic()
            if self.requests >= self.max_requests or self.bytes_read >= self.max_bytes or remaining_seconds <= 0:
                raise DeltaError("Delta budget exhausted. Resume the saved window.")
            self.requests += 1
            connection = http.client.HTTPSConnection("api.openalex.org", timeout=min(30, remaining_seconds))
            expired = threading.Event()
            transport_ref = [None]
            def cancel_request():
                expired.set()
                transport = transport_ref[0] or connection.sock
                if transport is not None:
                    try:
                        transport.shutdown(socket.SHUT_RDWR)
                    except OSError:
                        pass  # The request may already have closed its socket.
            deadline_timer = threading.Timer(remaining_seconds, cancel_request)
            deadline_timer.daemon = True
            deadline_timer.start()
            try:
                connection.connect()
                transport = connection.sock
                transport_ref[0] = transport
                remaining_seconds = self.deadline - time.monotonic()
                if expired.is_set() or remaining_seconds <= 0:
                    raise DeltaError("Delta time budget exhausted. Resume the saved window.")
                transport.settimeout(min(30, remaining_seconds))
                connection.request("GET", "/works?" + query, headers={
                    "Authorization": "Bearer " + self.api_key, "User-Agent": "protokol-7-openalex-delta/1.0"})
                with connection.getresponse() as response:
                    if expired.is_set() or time.monotonic() >= self.deadline:
                        raise DeltaError("Delta time budget exhausted. Resume the saved window.")
                    if 300 <= response.status < 400:
                        raise DeltaError("OpenAlex redirect refused. Check the API endpoint.")
                    if response.status in (401, 403):
                        raise DeltaError("Delta access denied. Check paid sync access.")
                    if response.status not in (429, 500, 502, 503, 504):
                        if response.status != 200:
                            raise DeltaError("Delta request rejected. Check API filter access.")
                        payload = bytearray()
                        while True:
                            remaining_seconds = self.deadline - time.monotonic()
                            if remaining_seconds <= 0:
                                raise DeltaError("Delta time budget exhausted. Resume the saved window.")
                            transport.settimeout(min(30, remaining_seconds))
                            chunk = response.read1(min(65536, self.max_bytes - self.bytes_read + 1))
                            self.bytes_read += len(chunk)
                            if self.bytes_read > self.max_bytes:
                                raise DeltaError("Delta byte budget exhausted. Resume the saved window.")
                            if time.monotonic() > self.deadline:
                                raise DeltaError("Delta time budget exhausted. Resume the saved window.")
                            if not chunk:
                                return json.loads(payload)
                            payload.extend(chunk)
            except (TimeoutError, OSError, http.client.HTTPException):
                pass
            finally:
                deadline_timer.cancel()
                deadline_timer.join()
                connection.close()
            if attempt < 2:
                delay = min(2**attempt, max(0, self.deadline - time.monotonic()))
                time.sleep(delay)
        raise DeltaError("Delta request failed. Resume the saved window.")
