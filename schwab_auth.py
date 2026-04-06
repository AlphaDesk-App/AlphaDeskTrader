# schwab_auth.py
#
# Run this ONCE to connect your Schwab account.
# Uses the exact same approach as your old AlphaDesk app —
# embedded browser that intercepts the redirect automatically.
#
# Usage:
#   py schwab_auth.py
#
# This will:
# 1. Open a browser window with Schwab login
# 2. You log in normally
# 3. Script captures the auth code automatically
# 4. Exchanges it for tokens
# 5. Saves tokens to the database for your user
# 6. Done — close the window

import sys
import json
import base64
import time
import httpx
import asyncio
from urllib.parse import urlparse, parse_qs

# ── Config ────────────────────────────────────────────────────────────────────

FASTAPI_URL  = "http://127.0.0.1:8000"
AUTH_URL     = "https://api.schwabapi.com/v1/oauth/authorize"
TOKEN_URL    = "https://api.schwabapi.com/v1/oauth/token"
REDIRECT_URI = "https://127.0.0.1"

# ── Get user credentials ──────────────────────────────────────────────────────

print("=" * 55)
print("  AlphaDesk — Schwab Account Connection")
print("=" * 55)
print()

email    = input("Your AlphaDesk email: ").strip()
password = input("Your AlphaDesk password: ").strip()

# Login to AlphaDesk to get JWT token
print("\nLogging into AlphaDesk...")
try:
    res = httpx.post(f"{FASTAPI_URL}/auth/login",
                     json={"email": email, "password": password})
    if res.status_code != 200:
        print(f"Login failed: {res.json().get('detail', 'Unknown error')}")
        sys.exit(1)
    data = res.json()
    jwt_token = data["token"]
    user_id   = data["user_id"]
    print(f"✅ Logged in as {data['email']}")
except Exception as e:
    print(f"Could not connect to AlphaDesk backend: {e}")
    print("Make sure uvicorn is running on port 8000")
    sys.exit(1)

# Get Schwab auth URL
print("\nGetting Schwab auth URL...")
try:
    res = httpx.get(f"{FASTAPI_URL}/auth/schwab/connect",
                    headers={"Authorization": f"Bearer {jwt_token}"})
    auth_url = res.json()["auth_url"]
except Exception as e:
    print(f"Failed to get auth URL: {e}")
    sys.exit(1)

# ── Try PyQt6 embedded browser first (same as old app) ───────────────────────

HAS_QT = False
try:
    from PyQt6.QtWidgets import QApplication, QDialog, QVBoxLayout
    from PyQt6.QtCore import Qt, QUrl, QTimer
    from PyQt6.QtWebEngineWidgets import QWebEngineView
    from PyQt6.QtWebEngineCore import QWebEngineProfile, QWebEnginePage
    HAS_QT = True
except ImportError:
    pass

if HAS_QT:
    print("\nOpening embedded browser (same as old AlphaDesk)...")

    app = QApplication(sys.argv)
    captured_code = [None]

    class CallbackPage(QWebEnginePage):
        def __init__(self, profile, parent):
            super().__init__(profile, parent)
            self.urlChanged.connect(self._check_url)

        def _check_url(self, url):
            url_str = url.toString()
            if "code=" in url_str or url_str.startswith("https://127.0.0.1"):
                try:
                    parsed = urlparse(url_str)
                    params = parse_qs(parsed.query)
                    code   = params.get("code", [None])[0]
                    if code and not captured_code[0]:
                        captured_code[0] = code
                        print(f"\n✅ Auth code captured!")
                        QTimer.singleShot(500, app.quit)
                except Exception as e:
                    print(f"Error capturing code: {e}")

    dialog   = QDialog()
    dialog.setWindowTitle("AlphaDesk — Sign in to Schwab")
    dialog.setMinimumSize(900, 650)
    layout   = QVBoxLayout(dialog)
    layout.setContentsMargins(0, 0, 0, 0)

    profile  = QWebEngineProfile("schwab_auth")
    profile.setPersistentCookiesPolicy(
        QWebEngineProfile.PersistentCookiesPolicy.NoPersistentCookies)
    page     = CallbackPage(profile, dialog)
    view     = QWebEngineView()
    view.setPage(page)
    view.setUrl(QUrl(auth_url))
    layout.addWidget(view)

    dialog.show()
    app.exec()

    code = captured_code[0]

else:
    # ── Fallback: manual URL paste ────────────────────────────────────────────
    print("\n" + "=" * 55)
    print("PyQt6/WebEngine not available.")
    print("Manual steps:")
    print("=" * 55)
    print(f"\n1. Open this URL in your browser:\n\n   {auth_url}\n")
    print("2. Log in to Schwab and approve access")
    print("3. You'll be redirected to https://127.0.0.1?code=...")
    print("   (The page will show an error — that's OK)")
    print("4. Copy the FULL URL from the browser address bar")
    print()
    redirect_url = input("Paste the full redirect URL here: ").strip()

    try:
        parsed = urlparse(redirect_url)
        params = parse_qs(parsed.query)
        code   = params.get("code", [None])[0]
        if not code:
            print("No code found in URL")
            sys.exit(1)
    except Exception as e:
        print(f"Could not parse URL: {e}")
        sys.exit(1)

# ── Exchange code for tokens via FastAPI ──────────────────────────────────────

if not code:
    print("No auth code captured. Please try again.")
    sys.exit(1)

print("\nExchanging code for tokens...")
try:
    res = httpx.get(
        f"{FASTAPI_URL}/auth/schwab/callback",
        params={"code": code, "state": user_id},
        headers={"Authorization": f"Bearer {jwt_token}"},
        timeout=15,
    )
    if res.status_code == 200:
        print("\n" + "=" * 55)
        print("  ✅ Schwab account connected successfully!")
        print("  You can now use AlphaDesk normally.")
        print("=" * 55)
    else:
        print(f"\n❌ Token exchange failed: {res.text}")
        sys.exit(1)
except Exception as e:
    print(f"\n❌ Error: {e}")
    sys.exit(1)

input("\nPress Enter to close...")
