import { useEffect, useState } from 'react';
import { DollarSign, TrendingUp, Zap, Wallet } from 'lucide-react';
import { api } from '../services/api';
import { useAccountHash } from '../hooks/useAccountHash';

interface AccountSummaryProps {
  onAccountLoaded?: (hash: string) => void;
}

export default function AccountSummary({ onAccountLoaded }: AccountSummaryProps) {
  const { accountHash, loading: hashLoading } = useAccountHash();
  const [balances, setBalances] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accountHash) return;
    onAccountLoaded?.(accountHash);
    api.getPortfolio(accountHash)
      .then(data => setBalances(data?.securitiesAccount?.currentBalances ?? null))
      .catch(() => setBalances(null))
      .finally(() => setLoading(false));
  }, [accountHash]);

  if (hashLoading || loading) return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      {[...Array(4)].map((_, i) => (
        <div key={i} className="card" style={{ height: 90, background: 'var(--bg-secondary)' }} />
      ))}
    </div>
  );

  const liquidation = balances?.liquidationValue ?? 0;
  const buyingPower = balances?.cashAvailableForTrading ?? 0;
  const cash        = balances?.cashBalance ?? 0;
  const pending     = balances?.pendingDeposits ?? 0;

  const metrics = [
    { label: 'Portfolio Value',  value: `$${liquidation.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: DollarSign, color: 'var(--accent)',  bg: 'var(--accent-muted)' },
    { label: 'Available Cash',   value: `$${buyingPower.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: TrendingUp,  color: 'var(--green)',   bg: 'var(--green-bg)'     },
    { label: 'Cash Balance',     value: `$${cash.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,        icon: Wallet,      color: 'var(--amber)',   bg: 'var(--amber-bg)'     },
    { label: 'Pending Deposits', value: `$${pending.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,     icon: Zap,         color: 'var(--text-secondary)', bg: 'var(--bg-tertiary)' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      {metrics.map(({ label, value, icon: Icon, color, bg }) => (
        <div key={label} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '-0.02em' }}>{value}</div>
            </div>
            <div style={{ background: bg, borderRadius: 8, padding: 8 }}>
              <Icon size={16} color={color} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
