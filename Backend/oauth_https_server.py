# oauth_https_server.py
#
# Runs an HTTPS server on 127.0.0.1:443 to catch Schwab's OAuth redirect.
# Must be run as Administrator on Windows (port 443 requires elevated privileges).
#
# Run: python oauth_https_server.py
#
# This script:
# 1. Generates a self-signed SSL cert for 127.0.0.1
# 2. Listens on https://127.0.0.1 (port 443)
# 3. Catches ?code= from Schwab redirect
# 4. Forwards code to FastAPI backend
# 5. Shows success page that closes itself and notifies AlphaDesk

import ssl
import http.server
import urllib.parse
import ipaddress
import datetime
import httpx
import os
import sys

FASTAPI_URL = "http://127.0.0.1:8000"
PORT = 443
CERT_FILE = "oauth_cert.pem"
KEY_FILE  = "oauth_key.pem"


def generate_self_signed_cert():
    """Generate a self-signed cert for 127.0.0.1 if not already present."""
    if os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE):
        print("[OAuth] Using existing SSL certificate")
        return

    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        import datetime

        print("[OAuth] Generating self-signed SSL certificate...")
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, u"127.0.0.1"),
        ])

        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(datetime.datetime.utcnow())
            .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=365))
            .add_extension(
                x509.SubjectAlternativeName([
                    x509.IPAddress(ipaddress.IPv4Address('127.0.0.1')),
                ]),
                critical=False,
            )
            .sign(key, hashes.SHA256())
        )

        with open(KEY_FILE, "wb") as f:
            f.write(key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.TraditionalOpenSSL,
                serialization.NoEncryption(),
            ))

        with open(CERT_FILE, "wb") as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))

        print("[OAuth] SSL certificate generated successfully")

    except ImportError:
        print("[OAuth] ERROR: cryptography package required")
        print("Run: py -m pip install cryptography")
        sys.exit(1)


class OAuthCallbackHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        code  = params.get('code',  [None])[0]
        state = params.get('state', [None])[0]

        if not code:
            self._send_html(self._error_page("No authorization code received from Schwab."))
            return

        print(f"[OAuth] Received auth code — forwarding to FastAPI...")

        try:
            res = httpx.get(
                f"{FASTAPI_URL}/auth/schwab/callback",
                params={"code": code, "state": state or ""},
                timeout=15,
            )
            if res.status_code == 200:
                print("[OAuth] ✅ Tokens saved successfully")
                self._send_html(self._success_page())
            else:
                print(f"[OAuth] ❌ Error: {res.text}")
                self._send_html(self._error_page(f"Token exchange failed: {res.text}"))
        except Exception as e:
            print(f"[OAuth] ❌ Exception: {e}")
            self._send_html(self._error_page(str(e)))

    def _send_html(self, html: str):
        self.send_response(200)
        self.send_header('Content-type', 'text/html')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(html.encode())

    def _success_page(self):
        return """<!DOCTYPE html>
<html>
<head>
<title>AlphaDesk — Connected</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif;
         background: #0a0a0f; color: #e8e8f0;
         display: flex; align-items: center; justify-content: center;
         min-height: 100vh; }
  .card { text-align: center; padding: 48px 40px; }
  .icon { width: 72px; height: 72px; background: #052e16; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 24px; font-size: 32px; }
  h2 { font-size: 24px; font-weight: 700; margin-bottom: 10px; }
  p  { color: #9090b0; font-size: 14px; }
</style>
<script>
  // Notify the AlphaDesk window that auth succeeded
  try {
    if (window.opener) {
      window.opener.postMessage({ type: 'SCHWAB_AUTH_SUCCESS' }, 'http://localhost:5173');
      window.opener.postMessage({ type: 'SCHWAB_AUTH_SUCCESS' }, 'http://127.0.0.1:5173');
    }
  } catch(e) {}
  // Auto close after 2 seconds
  setTimeout(() => { try { window.close(); } catch(e) {} }, 2000);
</script>
</head>
<body>
<div class="card">
  <div class="icon">✓</div>
  <h2>Schwab Connected!</h2>
  <p>This window will close automatically...</p>
</div>
</body>
</html>"""

    def _error_page(self, message):
        return f"""<!DOCTYPE html>
<html>
<head>
<title>AlphaDesk — Error</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: -apple-system, sans-serif; background: #0a0a0f; color: #e8e8f0;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; }}
  .card {{ text-align: center; padding: 40px; max-width: 400px; }}
  h2 {{ color: #ef4444; font-size: 20px; margin-bottom: 12px; }}
  p  {{ color: #9090b0; font-size: 13px; line-height: 1.5; }}
</style>
</head>
<body>
<div class="card">
  <h2>Connection Failed</h2>
  <p>{message}</p>
  <p style="margin-top:16px">Please close this window and try again.</p>
</div>
</body>
</html>"""

    def log_message(self, format, *args):
        pass  # Suppress default logs


def run():
    generate_self_signed_cert()

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(CERT_FILE, KEY_FILE)

    server = http.server.HTTPServer(('127.0.0.1', PORT), OAuthCallbackHandler)
    server.socket = context.wrap_socket(server.socket, server_side=True)

    print(f"[OAuth] HTTPS server running on https://127.0.0.1:{PORT}")
    print(f"[OAuth] Waiting for Schwab redirect...")
    print(f"[OAuth] Press Ctrl+C to stop")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[OAuth] Server stopped")


if __name__ == '__main__':
    if PORT < 1024 and sys.platform == 'win32':
        import ctypes
        if not ctypes.windll.shell32.IsUserAnAdmin():
            print("=" * 50)
            print("ERROR: Must run as Administrator!")
            print("Right-click your terminal and select")
            print("'Run as administrator', then try again.")
            print("=" * 50)
            sys.exit(1)
    run()
