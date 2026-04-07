import { useEffect, useRef, useState, useCallback } from 'react';

function getWsBase(): string {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'ws://127.0.0.1:8000';
  return 'wss://alphadesktrader.onrender.com';
}

export function useQuote(symbol: string) {
  const [data, setData]   = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef             = useRef<WebSocket | null>(null);
  const retryRef          = useRef<ReturnType<typeof setTimeout> | null>(null);
  const token             = localStorage.getItem('alphaDesk_token') ?? '';

  const connect = useCallback(() => {
    if (!symbol) return;
    if (wsRef.current) wsRef.current.close();

    const ws = new WebSocket(`${getWsBase()}/ws/quotes/${symbol}?token=${token}`);

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.error) setError(msg.error);
        else { setData(msg); setError(null); }
      } catch {}
    };

    ws.onerror = () => setError('Connection error');

    ws.onclose = () => {
      retryRef.current = setTimeout(connect, 2000);
    };

    wsRef.current = ws;
  }, [symbol]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [connect]);

  return { data, error };
}
