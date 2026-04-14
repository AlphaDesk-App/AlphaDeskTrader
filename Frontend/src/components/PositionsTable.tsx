import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { api } from '../services/api';

interface PositionsTableProps {
  accountHash: string;
}

export default function PositionsTable({ accountHash }: PositionsTableProps) {
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!accountHash) return;
    setLoading(true);
    try {
      const data = await api.getPortfolio(accountHash);
      setPositions(data?.securitiesAccount?.positions ?? []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [accountHash]);

  if (loading) return (
    <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
      Loading positions...
    </div>
  );

  if (error) return (
    <div className="card" style={{ color: 'var(--red)', padding: 20, fontSize: 13 }}>
      Error: {error}
    </div>
  );

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>OPEN POSITIONS</span>
        <button onClick={load} className="btn btn-secondary" style={{ padding: '5px 8px' }}>
          <RefreshCw size={12} />
        </button>
      </div>

      {positions.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          No open positions
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Symbol', 'Qty', 'Avg Cost', 'Market Val', 'Day P&L', 'P&L %'].map(h => (
                  <th key={h} style={{ padding: '8px 16px', textAlign: h === 'Symbol' ? 'left' : 'right', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.map((pos: any, i: number) => {
                const sym = pos.instrument?.symbol ?? '';
                const qty = pos.longQuantity || pos.shortQuantity || 0;
                const avg = pos.averagePrice ?? 0;
                const mktVal = pos.marketValue ?? 0;
                const dayPnl = pos.currentDayProfitLoss ?? 0;
                const dayPnlPct = pos.currentDayProfitLossPercentage ?? 0;
                const pos_ = dayPnl >= 0;

                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ fontWeight: 600, fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }}>{sym}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{pos.instrument?.assetType}</div>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>{qty}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>${avg.toFixed(2)}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>${mktVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, color: pos_ ? 'var(--green)' : 'var(--red)', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600 }}>
                        {pos_ ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {pos_ ? '+' : ''}${dayPnl.toFixed(2)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: pos_ ? 'var(--green)' : 'var(--red)', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600 }}>
                      {pos_ ? '+' : ''}{dayPnlPct.toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
