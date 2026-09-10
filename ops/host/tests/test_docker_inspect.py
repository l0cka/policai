"""Exercise Docker's actual template renderer against an isolated fake API."""

import http.server
import json
import os
import shutil
import socketserver
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path

from host import Host


class InspectTests(unittest.TestCase):
    def inspect(self, health):
        container = {
            "Id": "a" * 64,
            "Image": "sha256:" + "b" * 64,
            "State": {"Status": "running"},
            "Mounts": [],
            "Config": {"Labels": {"com.docker.compose.project": "probono-radar"}},
            "NetworkSettings": {"Ports": {}},
        }
        if health is not None:
            container["State"]["Health"] = {"Status": health}

        class Handler(http.server.BaseHTTPRequestHandler):
            def respond(self, head=False):
                ping = self.path == "/_ping"
                body = b"OK" if ping else json.dumps(container).encode()
                self.send_response(200)
                self.send_header("API-Version", "1.44")
                self.send_header("Content-Type", "text/plain" if ping else "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                if not head:
                    self.wfile.write(body)

            def do_HEAD(self):
                self.respond(head=True)

            def do_GET(self):
                self.respond()

            def log_message(self, *_args):
                pass

        # Use a short socket path; repository-local TMPDIR can exceed AF_UNIX's limit.
        with tempfile.TemporaryDirectory(prefix="pci-docker-", dir="/tmp") as directory:
            socket = str(Path(directory) / "api.sock")
            server = socketserver.UnixStreamServer(socket, Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()

            class FixtureRunner:
                def execute(self, argv, _cwd, **_kwargs):
                    command = [
                        shutil.which("docker"),
                        "--host=unix://" + socket,
                        "--config=" + directory,
                        *argv[1:],
                    ]
                    return subprocess.run(
                        command,
                        env={"PATH": os.defpath, "HOME": directory},
                        capture_output=True,
                        text=True,
                        check=True,
                        timeout=10,
                    ).stdout

            try:
                return Host({}, state=object(), runner=FixtureRunner()).inspect_container("fixture")
            finally:
                server.shutdown()
                thread.join(timeout=5)
                server.server_close()

    def test_container_without_healthcheck(self):
        result = self.inspect(None)
        self.assertEqual(result["State"], {"Status": "running", "Health": {"Status": None}})

    def test_container_with_healthcheck(self):
        result = self.inspect("healthy")
        self.assertEqual(result["State"]["Health"]["Status"], "healthy")
