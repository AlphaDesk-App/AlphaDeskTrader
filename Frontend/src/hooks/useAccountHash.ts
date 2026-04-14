import { useEffect, useState } from 'react';
import { api } from '../services/api';

export function useAccountHash() {
  const [accountHash, setAccountHash] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAccountHashes()
      .then(data => {
        const hash = data?.[0]?.hashValue ?? '';
        setAccountHash(hash);
      })
      .catch(() => setAccountHash(''))
      .finally(() => setLoading(false));
  }, []);

  return { accountHash, loading };
}
