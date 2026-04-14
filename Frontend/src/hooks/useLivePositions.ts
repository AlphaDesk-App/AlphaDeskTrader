import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../services/api';

export function useLivePositions(accountHash: string) {
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    if (!accountHash) return;
    try {
      const data = await api.getPortfolio(accountHash);
      setPositions(data?.securitiesAccount?.positions ?? []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
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

  return { positions, loading, error, refresh: fetch };
}
