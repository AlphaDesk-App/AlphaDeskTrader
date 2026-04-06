import sys

method = '''
    def get_account_numbers(self) -> list:
        response = httpx.get(
            f"{TRADER_BASE}/accounts/accountNumbers",
            headers=self._get_headers(),
        )
        response.raise_for_status()
        return response.json()

'''

with open('schwab/client.py', 'r') as f:
    src = f.read()

if 'get_account_numbers' in src:
    print('already exists')
    sys.exit(0)

idx = src.find('    def get_accounts')
if idx == -1:
    print('ERROR: could not find get_accounts method')
    sys.exit(1)

new_src = src[:idx] + method + src[idx:]
with open('schwab/client.py', 'w') as f:
    f.write(new_src)
print('done')
