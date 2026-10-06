"""Bounded single-worker jobs with explicit admission and drain semantics."""
from concurrent.futures import Future
from queue import Queue
from threading import Lock, Thread, current_thread


class UploadQueue:
    def __init__(self, capacity=4):
        if isinstance(capacity, bool) or not isinstance(capacity, int) or capacity < 1:
            raise ValueError("Queue capacity must be a positive integer")
        self.queue = Queue(maxsize=capacity)
        self._lock = Lock()
        self._closed = False
        self._thread = Thread(target=self._work, name='drive-upload', daemon=True)
        self._thread.start()

    def submit(self, operation):
        if current_thread() is self._thread:
            raise RuntimeError("Recursive upload admission is not supported")
        future = Future()
        with self._lock:
            if self._closed:
                raise RuntimeError('Upload queue is closed')
            self.queue.put((future, operation))
        return future

    def _work(self):
        while True:
            entry = self.queue.get()
            try:
                if entry is None:
                    return
                future, operation = entry
                if future.set_running_or_notify_cancel():
                    try:
                        future.set_result(operation())
                    except BaseException as error:
                        future.set_exception(error)
            finally:
                self.queue.task_done()

    def close(self):
        if current_thread() is self._thread:
            raise RuntimeError("Upload worker cannot join itself")
        with self._lock:
            if not self._closed:
                self._closed = True
                self.queue.put(None)
        self._thread.join()
