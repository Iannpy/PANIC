"""Local preview with HTTP byte ranges, needed for seeking within MP3 files."""

from __future__ import annotations

import argparse
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class RangeHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_head(self):
        self.byte_range = None
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        try:
            stream = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None
        size = os.fstat(stream.fileno()).st_size
        requested = self.headers.get("Range", "")
        if requested.startswith("bytes="):
            try:
                start_text, end_text = requested[6:].split("-", 1)
                if not start_text and not end_text:
                    raise ValueError("empty range")
                start = int(start_text) if start_text else max(0, size - int(end_text))
                end = int(end_text) if end_text and start_text else size - 1
                if start < 0 or start >= size or end < start:
                    raise ValueError("unsatisfiable range")
                end = min(end, size - 1)
            except ValueError:
                stream.close()
                self.send_error(416, "Range Not Satisfiable")
                return None
            self.byte_range = (start, end)
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            length = end - start + 1
        else:
            self.send_response(200)
            length = size
        self.send_header("Content-type", self.guess_type(path))
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        return stream

    def copyfile(self, source, outputfile):
        if self.byte_range is None:
            return super().copyfile(source, outputfile)
        start, end = self.byte_range
        source.seek(start)
        remaining = end - start + 1
        while remaining:
            chunk = source.read(min(64 * 1024, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    print(f"Serving {ROOT} at http://127.0.0.1:{args.port}/")
    ThreadingHTTPServer(("127.0.0.1", args.port), RangeHandler).serve_forever()


if __name__ == "__main__":
    main()
