import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../services/api';

export function useLiveOrders(accountHash: string) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    if (!accountHash) return;
    try {
      const data = await api.getOrders(accountHash);
      setOrders(data ?? []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [accountHash]);

  useEffect(() => {
    if (!accountHash) return;
    fetch();
    intervalRef.current = setInterval(fetch, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetch, accountHash]);

  return { orders, loading, refresh: fetch };
}
