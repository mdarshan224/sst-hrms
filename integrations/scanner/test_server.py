import base64, hashlib, hmac, unittest
from unittest.mock import patch
import server
class ScannerTests(unittest.TestCase):
    def test_request_authentication_and_replay(self):
        body=b"%PDF-1.7 synthetic";secret="s"*40;token="t"*40
        digest=hashlib.sha256(body).hexdigest()
        doc="11111111-1111-4111-8111-111111111111";rid="22222222-2222-4222-8222-222222222222"
        ts="1000000";message=(ts+"\n"+doc+"\n"+rid+"\n"+digest+"\n").encode()+body
        headers={"Authorization":"Bearer "+token,"x-scan-timestamp":ts,"x-scan-document":doc,"x-scan-request-id":rid,"x-scan-digest":digest,"x-scan-signature":base64.b64encode(hmac.digest(secret.encode(),message,"sha256")).decode()}
        self.assertEqual(server.authenticate(headers,body,token,secret,1000),(doc,rid,digest))
        for values,content,clock in [(dict(headers,Authorization="bad"),body,1000),(headers,b"changed",1000),(headers,body,2000),(dict(headers,**{"x-scan-signature":"forged"}),body,1000)]:
            with self.assertRaises(ValueError):server.authenticate(values,content,token,secret,clock)
    def test_engine_unavailability_never_becomes_clean(self):
        with self.assertRaises(OSError):server.scan(b"synthetic","/nonexistent/clamd.sock")
    def test_actual_protocol_only_accepts_explicit_engine_verdict(self):
        for response,verdict in [(b"stream: OK\0","clean"),(b"stream: Synthetic FOUND\0","infected")]:
            with patch("server.socket.socket") as mock:
                mock.return_value.__enter__.return_value.recv.return_value=response
                self.assertEqual(server.scan(b"test","test"),verdict)
        with patch("server.socket.socket") as mock:
            mock.return_value.__enter__.return_value.recv.return_value=b"stream: ERROR\0"
            with self.assertRaises(RuntimeError):server.scan(b"test","test")
if __name__=="__main__":unittest.main()
