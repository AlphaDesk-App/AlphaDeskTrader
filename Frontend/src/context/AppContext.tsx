import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { api } from '../services/api';

interface AppState {
  accountHash:  string;
  balances:     any;
  positions:    any[];
  orders:       any[];
  quotes:       Record<string, any>;
  loading:      boolean;
  lastUpdated:  Date | null;
  setWatchSymbols: (symbols: string[]) => void;
  refreshOrders:   () => Promise<void>;
  refreshPositions: () => Promise<void>;
}

const AppContext = createContext<AppState>({
  accountHash: '', balances: null, positions: [], orders: [],
  quotes: {}, loading: true, lastUpdated: null,
  setWatchSymbols: () => {}, refreshOrders: async () => {}, refreshPositions: async () => {},
});

const DEFAULT_SYMBOLS = ['SPY','QQQ','AAPL','NVDA','AMD','TSLA','MSFT','PLTR','IWM','DIA'];

export function AppProvider({ children }: { children: ReactNode }) {
  const [accountHash,  setAccountHash]  = useState('');
  const [balances,     setBalances]     = useState<any>(null);
  const [positions,    setPositions]    = useState<any[]>([]);
  const [orders,       setOrders]       = useState<any[]>([]);
  const [quotes,       setQuotes]       = useState<Record<string,any>>({});
  const [loading,      setLoading]      = useState(true);
  const [lastUpdated,  setLastUpdated]  = useState<Date|null>(null);
  const [watchSymbols, setWatchSymbolsState] = useState<string[]>(DEFAULT_SYMBOLS);

  const hashRef     = useRef('');
  const wsRefs      = useRef<Record<string, WebSocket>>({});
  const posTimerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const ordTimerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const balTimerRef = useRef<ReturnType<typeof setInterval>|null>(null);

  // ── Quote WebSockets (1 second via server push) ──────────────────────────
  const connectQuote = useCallback((symbol: string) => {
    if (wsRefs.current[symbol]) return; // already connected
    const token = localStorage.getItem('alphaDesk_token') ?? '';
    const host  = window.location.hostname;
    const wsBase = (host === 'localhost' || host === '127.0.0.1')
      ? 'ws://127.0.0.1:8000'
      : 'wss://alphadesktrader.onrender.com';
    const ws = new WebSocket(`${wsBase}/ws/quotes/${symbol}?token=${token}`);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (!msg.error) {
          setQuotes(prev => ({ ...prev, [symbol]: msg }));
          setLastUpdated(new Date());
        }
      } catch {}
    };
    ws.onclose = () => {
      delete wsRefs.current[symbol];
      // Reconnect after 2s if still in watch list
      setTimeout(() => {
        if (watchSymbols.includes(symbol)) connectQuote(symbol);
      }, 2000);
    };
    ws.onerror = () => ws.close();
    wsRefs.current[symbol] = ws;
  }, [watchSymbols]);

  const disconnectQuote = useCallback((symbol: string) => {
    const ws = wsRefs.current[symbol];
    if (ws) { ws.onclose = null; ws.close(); delete wsRefs.current[symbol]; }
  }, []);

  // Update watch symbols — connect new ones, disconnect removed ones
  const setWatchSymbols = useCallback((symbols: string[]) => {
    setWatchSymbolsState(prev => {
      const toAdd    = symbols.filter(s => !prev.includes(s));
      const toRemove = prev.filter(s => !symbols.includes(s));
      toRemove.forEach(disconnectQuote);
      toAdd.forEach(connectQuote);
      return symbols;
    });
  }, [connectQuote, disconnectQuote]);

  // ── REST polling helpers ──────────────────────────────────────────────────
  const fetchPositions = useCallback(async (hash: string) => {
    if (!hash) return;
    try {
      const d = await api.getPortfolio(hash);
      setPositions(d?.securitiesAccount?.positions ?? []);
      setBalances(d?.securitiesAccount?.currentBalances ?? null);
    } catch {}
  }, []);

  const fetchOrders = useCallback(async (hash: string) => {
    if (!hash) return;
    try {
      // Fetch enough days to cover YTD (day of year + buffer, capped at 365)
      const now = new Date();
      const ytdDays = Math.min(Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000) + 1, 365);
      const d = await api.getOrders(hash, ytdDays);
      setOrders(Array.isArray(d) ? d : []);
    } catch {}
  }, []);

  const refreshOrders    = useCallback(() => fetchOrders(hashRef.current),    [fetchOrders]);
  const refreshPositions = useCallback(() => fetchPositions(hashRef.current), [fetchPositions]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('alphaDesk_token');
    if (!token) { setLoading(false); return; }

    (async () => {
      try {
        const hashes = await api.getAccountHashes();
        const hash   = hashes?.[0]?.hashValue ?? hashes?.[0] ?? '';
        setAccountHash(hash);
        hashRef.current = hash;

        await Promise.all([fetchPositions(hash), fetchOrders(hash)]);

        // Connect quote sockets
        DEFAULT_SYMBOLS.forEach(connectQuote);

        // Start polling timers
        posTimerRef.current = setInterval(() => fetchPositions(hashRef.current), 5000);
        ordTimerRef.current = setInterval(() => fetchOrders(hashRef.current),    5000);

      } catch (e) {
        console.error('AppContext init error:', e);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      if (posTimerRef.current) clearInterval(posTimerRef.current);
      if (ordTimerRef.current) clearInterval(ordTimerRef.current);
      if (balTimerRef.current) clearInterval(balTimerRef.current);
      Object.values(wsRefs.current).forEach(ws => { ws.onclose = null; ws.close(); });
      wsRefs.current = {};
    };
  }, []);

  // Connect new watch symbols when they change
  useEffect(() => {
    if (accountHash) watchSymbols.forEach(connectQuote);
  }, [watchSymbols, accountHash, connectQuote]);

  return (
    <AppContext.Provider value={{
      accountHash, balances, positions, orders, quotes, loading, lastUpdated,
      setWatchSymbols, refreshOrders, refreshPositions,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
