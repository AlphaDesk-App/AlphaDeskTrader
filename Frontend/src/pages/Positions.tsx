import { useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import Header from '../components/Header';
import DateFilterBar from '../components/DateFilterBar';
import { DateFilter, filterByDate } from '../utils/dateFilter';
import { useAccountHash } from '../hooks/useAccountHash';
import { useLiveOrders } from '../hooks/useLiveOrders';
import { useLivePositions } from '../hooks/useLivePositions';

const TABS = ['Open', 'Working', 'Filled', 'Rejected'] as const;
type Tab = typeof TABS[number];

const STATUS_COLORS: Record<string, string> = {
  WORKING: 'badge-blue', FILLED: 'badge-green',
  CANCELED: 'badge-amber', REJECTED: 'badge-red',
  PENDING_ACTIVATION: 'badge-blue',
};

export default function Positions() {
  const { accountHash } = useAccountHash();
  const [tab, setTab] = useState<Tab>('Open');
  const [dateFilter, setDateFilter] = useState<DateFilter>({ range: 'today' });
  const { positions, loading: posLoading } = useLivePositions(accountHash);
  const { orders, loading: ordLoading }    = useLiveOrders(accountHash);

  const filterTime = (o: any) => o.closeTime ?? o.enteredTime ?? null;
  const filteredOrders = tab === 'Open' ? orders : filterByDate(orders, filterTime, dateFilter);
  const working  = filteredOrders.filter(o => ['WORKING','PENDING_ACTIVATION','QUEUED','ACCEPTED'].includes(o.status));
  const filled   = filteredOrders.filter(o => o.status === 'FILLED');
  const rejected = filteredOrders.filter(o => ['REJECTED','CANCELED','EXPIRED'].includes(o.status));

  const counts: Record<Tab, number> = {
    Open: positions.length, Working: working.length,
    Filled: filled.length, Rejected: rejected.length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header title="Positions" subtitle="Live positions & order status" />
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg-secondary)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
              background: tab === t ? 'var(--bg-card)' : 'transparent',
              color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
              boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.15)' : 'none',
            }}>
              {t}
              <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700,
                background: tab === t ? 'var(--accent-muted)' : 'var(--bg-tertiary)',
                color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
                padding: '1px 6px', borderRadius: 10 }}>{counts[t]}</span>
            </button>
          ))}
        </div>

        {/* Open Positions */}
        {tab === 'Open' && (
          posLoading ? <LoadingCard /> :
          positions.length === 0 ? <EmptyCard msg="No open positions" /> :
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Symbol','Type','Qty','Avg Cost','Market Val','Day P&L','P&L %'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Symbol' ? 'left' : 'right', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map((pos: any, i: number) => {
                  const sym    = pos.instrument?.symbol ?? '';
                  const qty    = pos.longQuantity || pos.shortQuantity || 0;
                  const avg    = pos.averagePrice ?? 0;
                  const mktVal = pos.marketValue ?? 0;
                  const dayPnl = pos.currentDayProfitLoss ?? 0;
                  const dayPct = pos.currentDayProfitLossPercentage ?? 0;
                  const isPos  = dayPnl >= 0;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '10px 16px', fontWeight: 700, fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }}>{sym}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}><span className="badge badge-blue">{pos.instrument?.assetType ?? '--'}</span></td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{qty}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>${avg.toFixed(2)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>${mktVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, color: isPos ? 'var(--green)' : 'var(--red)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                          {isPos ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {isPos ? '+' : ''}${dayPnl.toFixed(2)}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: isPos ? 'var(--green)' : 'var(--red)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                        {isPos ? '+' : ''}{dayPct.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Date filter for order tabs */}
        {tab !== 'Open' && (
          <div style={{ marginBottom: 14 }}>
            <DateFilterBar filter={dateFilter} onChange={setDateFilter} />
          </div>
        )}

        {/* Orders tabs */}
        {tab !== 'Open' && (() => {
          const rows = tab === 'Working' ? working : tab === 'Filled' ? filled : rejected;
          return ordLoading ? <LoadingCard /> :
            rows.length === 0 ? <EmptyCard msg={`No ${tab.toLowerCase()} orders`} /> :
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Symbol','Side','Type','Qty','Filled','Price','Status','Time'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Symbol' ? 'left' : 'right', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((order: any) => {
                    const leg  = order.orderLegCollection?.[0];
                    const sym  = leg?.instrument?.symbol ?? '--';
                    const side = leg?.instruction ?? '--';
                    return (
                      <tr key={order.orderId} style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '10px 16px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>{sym}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}><span style={{ fontSize: 11, fontWeight: 700, color: side.includes('BUY') ? 'var(--green)' : 'var(--red)' }}>{side}</span></td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>{order.orderType}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{order.quantity}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{order.filledQuantity}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{order.price ? `$${order.price.toFixed(2)}` : 'MKT'}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}><span className={`badge ${STATUS_COLORS[order.status] ?? 'badge-amber'}`}>{order.status}</span></td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {order.enteredTime ? new Date(order.enteredTime).toLocaleTimeString() : '--'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>;
        })()}
      </div>
    </div>
  );
}

function LoadingCard() {
  return <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading...</div>;
}
function EmptyCard({ msg }: { msg: string }) {
  return <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>{msg}</div>;
}
