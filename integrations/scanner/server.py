"""Private HRMS scanner gateway. Requires a real clamd engine; never infers clean."""
import base64, hashlib, hmac, json, os, re, socket, sqlite3, struct, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
MAX_BYTES = 2 * 1024 * 1024
LOCK = threading.Lock()

def authenticate(headers, body, token, secret, clock=None):
    clock = clock or time.time()
    if not token or len(secret) < 32 or not hmac.compare_digest(headers.get("Authorization", ""), "Bearer " + token):
        raise ValueError("authentication")
    ts, doc, rid, digest = (headers.get(k, "") for k in ("x-scan-timestamp", "x-scan-document", "x-scan-request-id", "x-scan-digest"))
    if not ts.isdigit() or abs(clock * 1000 - int(ts)) > 300000:
        raise ValueError("stale")
    if not all(re.fullmatch(r"[a-f0-9-]{36}", v) for v in (doc, rid)) or not re.fullmatch(r"[a-f0-9]{64}", digest):
        raise ValueError("metadata")
    if not body or len(body) > MAX_BYTES or hashlib.sha256(body).hexdigest() != digest:
        raise ValueError("digest")
    message = (ts + "\n" + doc + "\n" + rid + "\n" + digest + "\n").encode() + body
    expected = base64.b64encode(hmac.digest(secret.encode(), message, "sha256")).decode()
    if not hmac.compare_digest(expected, headers.get("x-scan-signature", "")):
        raise ValueError("signature")
    return doc, rid, digest

def scan(body, unix_socket):
    # INSTREAM avoids writing an employee document to disk.
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
        client.settimeout(25)
        client.connect(unix_socket)
        client.sendall(b"zINSTREAM\0")
        for offset in range(0, len(body), 65536):
            chunk = body[offset:offset+65536]
            client.sendall(struct.pack("!I", len(chunk)) + chunk)
        client.sendall(struct.pack("!I", 0))
        reply = b""
        while b"\0" not in reply:
            part = client.recv(1024)
            if not part or len(reply) + len(part) > 4096:
                raise RuntimeError("incomplete engine response")
            reply += part
        line = reply.split(b"\0", 1)[0].decode("ascii", "strict")
        if line == "stream: OK":
            return "clean"
        if line.startswith("stream: ") and line.endswith(" FOUND"):
            return "infected"
        raise RuntimeError("engine did not provide a verdict")

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # no request bodies, credentials or identity metadata in logs
    def do_POST(self):
        secret = os.environ.get("SCAN_HMAC_SECRET", "")
        try:
            if self.path != "/scan" or self.headers.get("Transfer-Encoding") or self.headers.get("Content-Type") != "application/octet-stream":
                raise ValueError("request")
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= MAX_BYTES:
                raise ValueError("size")
            self.connection.settimeout(10)
            body = self.rfile.read(size)
            doc, rid, digest = authenticate(self.headers, body, os.environ.get("SCAN_BEARER_TOKEN", ""), secret)
        except (ValueError, TimeoutError):
            self.send_error(403, "Invalid scan request")
            return
        try:
            with LOCK, sqlite3.connect(os.environ["SCAN_RECEIPT_DB"]) as db:
                db.execute("CREATE TABLE IF NOT EXISTS receipts(request_id TEXT PRIMARY KEY,document_id TEXT NOT NULL,digest TEXT NOT NULL,verdict TEXT NOT NULL,at INTEGER NOT NULL)")
                existing = db.execute("SELECT document_id,digest,verdict FROM receipts WHERE request_id=?", (rid,)).fetchone()
                if existing and existing[:2] != (doc, digest):
                    raise ValueError("replay mismatch")
                verdict = existing[2] if existing else scan(body, os.environ["CLAMD_SOCKET"])
                if not existing:
                    db.execute("INSERT INTO receipts VALUES(?,?,?,?,?)", (rid, doc, digest, verdict, int(time.time())))
                    db.commit()
                # Metadata only. Retain longer than maximum job replay window.
                db.execute("DELETE FROM receipts WHERE at<?", (int(time.time())-30*86400,))
            raw = json.dumps({"documentId":doc,"requestId":rid,"sha256":digest,"verdict":verdict}, separators=(",", ":")).encode()
            ts = str(int(time.time()*1000))
            sig = base64.b64encode(hmac.digest(secret.encode(), ts.encode()+raw, "sha256")).decode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("x-scan-timestamp", ts)
            self.send_header("x-scan-signature", sig)
            self.end_headers()
            self.wfile.write(raw)
        except (OSError, RuntimeError, KeyError, sqlite3.Error, ValueError):
            # Workers retain quarantine and retry; no signed clean receipt on failure.
            self.send_error(503, "Scan engine unavailable")

if __name__ == "__main__":
    required = ["SCAN_HMAC_SECRET","SCAN_BEARER_TOKEN","SCAN_RECEIPT_DB","CLAMD_SOCKET"]
    if any(not os.environ.get(k) for k in required):
        raise SystemExit("Configure scanner credentials, receipt storage and real clamd socket.")
    ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("PORT", "8080"))), Handler).serve_forever()
