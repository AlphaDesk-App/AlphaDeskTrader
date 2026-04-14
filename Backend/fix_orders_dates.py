import sys
from datetime import datetime, timedelta

with open('schwab/client.py', 'r') as f:
    src = f.read()

old = '''    def get_orders(self, account_hash: str) -> list:
        # Fetch all orders for a given account.
        # Returns working, filled, cancelled, and rejected orders.
        response = httpx.get(
            f"{TRADER_BASE}/accounts/{account_hash}/orders",
            headers=self._get_headers(),
        )
        response.raise_for_status()
        return response.json()'''

new = '''    def get_orders(self, account_hash: str, days_back: int = 60) -> list:
        # Fetch all orders for a given account.
        # Schwab requires fromEnteredTime and toEnteredTime parameters.
        # Default: last 60 days. Max allowed by Schwab is 60 days per request.
        now = datetime.utcnow()
        from_time = (now - timedelta(days=days_back)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        to_time = now.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        response = httpx.get(
            f"{TRADER_BASE}/accounts/{account_hash}/orders",
            params={
                "fromEnteredTime": from_time,
                "toEnteredTime":   to_time,
                "maxResults":      250,
            },
            headers=self._get_headers(),
        )
        response.raise_for_status()
        return response.json()'''

if 'fromEnteredTime' in src:
    print('already fixed')
    sys.exit(0)

if old not in src:
    # Try a simpler match just on the def line
    print('exact match not found - trying simple replacement')
    idx = src.find('    def get_orders(self, account_hash: str) -> list:')
    if idx == -1:
        print('ERROR: could not find get_orders method')
        sys.exit(1)
    end = src.find('\n    def ', idx + 10)
    new_src = src[:idx] + new + '\n\n' + src[end:]
else:
    new_src = src.replace(old, new)

# Make sure datetime is imported
if 'from datetime import' not in new_src:
    new_src = 'from datetime import datetime, timedelta\n' + new_src

with open('schwab/client.py', 'w') as f:
    f.write(new_src)
print('done')
