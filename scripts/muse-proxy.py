#!/usr/bin/env python3
"""Robust threaded proxy: Meta Muse Code -> LM Studio"""
import http.server
import urllib.request
import json
import socketserver
import sys

LM_STUDIO = "http://127.0.0.1:1234"
PORT = 18888


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("[PROXY] %s - %s\n" % (self.address_string(), fmt % args))

    def do_GET(self):
        target_path = "/v1/models" if self.path in ("/muse-code/models", "/v1/models") else self.path
        target = f"{LM_STUDIO}{target_path}"
        try:
            req = urllib.request.Request(target)
            req.add_header("Authorization", "Bearer lmstudio")
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            err = json.dumps({"error": str(e)}).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(err)))
            self.end_headers()
            self.wfile.write(err)

    def do_POST(self):
        cl = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(cl)
        target = f"{LM_STUDIO}{self.path}"
        try:
            req = urllib.request.Request(target, data=body, method="POST")
            req.add_header("Content-Type", "application/json")
            req.add_header("Authorization", "Bearer lmstudio")
            if "Accept" in self.headers:
                req.add_header("Accept", self.headers["Accept"])
            with urllib.request.urlopen(req, timeout=600) as resp:
                ct = resp.headers.get("Content-Type", "")
                if "event-stream" in ct:
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream")
                    self.send_header("Cache-Control", "no-cache")
                    self.send_header("Connection", "keep-alive")
                    self.end_headers()
                    while True:
                        chunk = resp.read(8192)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        self.wfile.flush()
                else:
                    data = resp.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
        except Exception as e:
            err = json.dumps({"error": str(e)}).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(err)))
            self.end_headers()
            self.wfile.write(err)


server = ThreadedHTTPServer(("127.0.0.1", PORT), Handler)
print(f"Robust threaded proxy on :{PORT}", flush=True, file=sys.stderr)
server.serve_forever()
