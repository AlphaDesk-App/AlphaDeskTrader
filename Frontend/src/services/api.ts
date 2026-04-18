const PROD_URL = 'https://alphadesktrader.onrender.com';

function getBase(): string {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return '/api';
  return PROD_URL;
}

function getWsBase(): string {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'ws://127.0.0.1:8000';
  return 'wss://alphadesktrader.onrender.com';
}

function getToken(): string {
  return localStorage.getItem('alphaDesk_token') ?? '';
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getBase()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
      ...((options?.headers as Record<string, string>) ?? {}),
    },
    ...options,
  });
  if (res.status === 401) {
    localStorage.removeItem('alphaDesk_token');
    window.location.href = '/login';
    throw new Error('Session expired');
  }
  if (!res.ok) {
    const body = await res.text();
    // Render / nginx can return HTML error pages — surface a clean message
    if (body.trimStart().startsWith('<')) throw new Error(`HTTP ${res.status} — server error`);
    throw new Error(body || `HTTP ${res.status}`);
  }
  // Guard: the SPA catch-all returns index.html (text/html, status 200).
  // Detect it here so we never call .json() on HTML and get a cryptic parse error.
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json') && !ct.includes('text/plain')) {
    throw new Error(`Expected JSON but server returned: ${ct} — route may not exist`);
  }
  return res.json();
}

export const api = {
  getAccounts:      ()                      => request<any[]>('/accounts/'),
  getAccountHashes: ()                      => request<any[]>('/accounts/hashes'),
  getPortfolio:     (hash: string)          => request<any>(`/accounts/${hash}/portfolio`),
  getQuote:         (symbol: string)        => request<any>(`/quotes/${symbol}`),
  getQuotes:        (symbols: string[])     => request<any>(`/quotes/?symbols=${symbols.join(',')}`),
  getPriceHistory:  (symbol: string, periodType: string, period: number, frequencyType: string, frequency: number) =>
    request<any>(`/quotes/${symbol}/history?period_type=${periodType}&period=${period}&frequency_type=${frequencyType}&frequency=${frequency}&need_extended_hours=true`),
  getOptionsChain:  (symbol: string, contractType = 'ALL', strikeCount = 20) =>
    request<any>(`/quotes/${symbol}/options?contract_type=${contractType}&strike_count=${strikeCount}`),
  getOrders:        (hash: string, daysBack = 60) => request<any[]>(`/orders/${hash}?days_back=${daysBack}`),
  placeOrder:       (hash: string, order: any) =>
    request<any>('/orders/place', { method: 'POST', body: JSON.stringify({ account_hash: hash, order }) }),
  cancelOrder:      (hash: string, orderId: string) =>
    request<any>(`/orders/cancel/${hash}/${orderId}`, { method: 'DELETE' }),
  health:           ()                      => request<any>('/health'),

  // Journal notes — persisted in DB so they sync across all computers
  getJournalNotes:  () =>
    request<Record<string, { setup: string; notes: string }>>('/journal/'),
  saveJournalNote:  (tradeId: string, setup: string, notes: string) =>
    request<any>('/journal/', { method: 'PUT', body: JSON.stringify({ trade_id: tradeId, setup, notes }) }),
};

export function createQuoteSocket(symbol: string, onMessage: (data: any) => void): WebSocket {
  const token = getToken();
  const ws = new WebSocket(`${getWsBase()}/ws/quotes/${symbol}?token=${token}`);
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  return ws;
}

export function createPortfolioSocket(accountHash: string, onMessage: (data: any) => void): WebSocket {
  const token = getToken();
  const ws = new WebSocket(`${getWsBase()}/ws/portfolio/${accountHash}?token=${token}`);
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  return ws;
}
