import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Zap, Wallet, BarChart2 } from 'lucide-react';
import Header from '../components/Header';
import { useAccountHash } from '../hooks/useAccountHash';
import { useLivePositions } from '../hooks/useLivePositions';
import { api } from '../services/api';
import QuoteTicker from '../components/QuoteTicker';

export default function Dashboard() {
  const { accountHash }             = useAccountHash();
  const { positions }               = useLivePositions(accountHash);
  const [balances, setBalances]     = useState<any>(null);
  const [orders, setOrders]         = useState<any[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState('SPY');

  useEffect(() => {
    if (!accountHash) return;
    api.getPortfolio(accountHash).then(d => setBalances(d?.securitiesAccount?.currentBalances ?? null)).catch(() => {});
    api.getOrders(accountHash).then(d => setOrders(d ?? [])).catch(() => {});
  }, [accountHash]);

  // ── Shared FIFO pairing utility ──────────────────────────────────────────
  const calcPnlFromOrders = (orderList: any[]): number => {
    const isOpt  = (sym: string) => /^[A-Z]+\d{6}[CP]\d+$/.test(sym);
    const isEntry = (instr: string) => instr === 'BUY' || instr === 'BUY_TO_OPEN';
    const isExit  = (instr: string) => instr === 'SELL' || instr === 'SELL_TO_CLOSE' || instr === 'SELL_SHORT';

    // Sort chronologically
    const filled = orderList
      .filter(o => o.status === 'FILLED' && o.orderLegCollection?.[0])
      .sort((a, b) => new Date(a.enteredTime ?? 0).getTime() - new Date(b.enteredTime ?? 0).getTime());

    // Group by symbol, FIFO match entries to exits
    const bySymbol: Record<string, any[]> = {};
    filled.forEach(o => {
      const sym = o.orderLegCollection[0].instrument?.symbol ?? '';
      if (!bySymbol[sym]) bySymbol[sym] = [];
      bySymbol[sym].push(o);
    });

    let total = 0;
    Object.entries(bySymbol).forEach(([sym, orders]) => {
      const mult     = isOpt(sym) ? 100 : 1;
      const buyQueue: any[] = [];
      orders.forEach(o => {
        const instr = (o.orderLegCollection[0].instruction ?? '').toUpperCase();
        if (isEntry(instr)) {
          buyQueue.push(o);
        } else if (isExit(instr) && buyQueue.length > 0) {
          const entry = buyQueue.shift();
          const qty   = Math.min(entry.filledQuantity ?? entry.quantity ?? 1, o.filledQuantity ?? o.quantity ?? 1);
          const bp    = entry.price ?? entry.averagePrice ?? 0;
          const sp    = o.price ?? o.averagePrice ?? 0;
          total += (sp - bp) * qty * mult;
        }
      });
    });
    return total;
  };

  // P&L calculations
  const openPnl = positions.reduce((s: number, p: any) => {
    const sym  = p.instrument?.symbol ?? '';
    const qty  = p.longQuantity || p.shortQuantity || 0;
    const avg  = p.averagePrice ?? 0;
    const mktV = p.marketValue ?? 0;
    const mult = /^[A-Z]+\d{6}[CP]\d+$/.test(sym) ? 100 : 1;
    const mark = qty > 0 ? mktV / (qty * mult) : 0;
    return s + (mark - avg) * qty * mult;
  }, 0);

  const today     = new Date().toDateString();
  const ytdStart  = new Date(new Date().getFullYear(), 0, 1);

  const dailyOrders = orders.filter(o => {
    const t = o.closeTime ?? o.enteredTime;
    return t && new Date(t).toDateString() === today;
  });
  const ytdOrders = orders.filter(o => {
    const t = o.closeTime ?? o.enteredTime;
    return t && new Date(t) >= ytdStart;
  });

  const dailyPnl = calcPnlFromOrders(dailyOrders);
  const ytdPnl   = calcPnlFromOrders(ytdOrders);

  const liquidation = balances?.liquidationValue ?? 0;
  const available   = balances?.cashAvailableForTrading ?? 0;

  const pnlCard = (label: string, value: number, icon: any) => ({
    label, value: `${value >= 0 ? '+' : ''}$${value.toFixed(2)}`,
    icon, color: value >= 0 ? 'var(--green)' : 'var(--red)',
    bg: value >= 0 ? 'var(--green-bg)' : 'var(--red-bg)',
  });

  const metrics = [
    { label: 'Portfolio Value', value: `$${liquidation.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: DollarSign, color: 'var(--accent)', bg: 'var(--accent-muted)' },
    { label: 'Available Cash',  value: `$${available.toLocaleString('en-US',  { minimumFractionDigits: 2 })}`, icon: Wallet,      color: 'var(--accent)', bg: 'var(--accent-muted)' },
    pnlCard('Open P&L',  openPnl,  TrendingUp),
    pnlCard('Daily P&L', dailyPnl, BarChart2),
    pnlCard('YTD P&L',   ytdPnl,   Zap),
  ];

  // Quick symbols
  const quickSymbols = ['SPY', 'QQQ', 'NVDA', 'TSLA'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header title="Dashboard" subtitle="Account overview" />
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Metric cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {metrics.map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color }}>{value}</div>
                </div>
                <div style={{ background: bg, borderRadius: 8, padding: 8 }}><Icon size={16} color={color} /></div>
              </div>
            </div>
          ))}
        </div>

        {/* Main grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>

          {/* Left: Quick quotes + Positions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Quick quote selector */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {quickSymbols.map(sym => (
                <div key={sym} onClick={() => setSelectedSymbol(sym)}
                  style={{ cursor: 'pointer', padding: '10px 14px', borderRadius: 10,
                    border: `1px solid ${selectedSymbol === sym ? 'var(--accent)' : 'var(--border)'}`,
                    background: selectedSymbol === sym ? 'var(--accent-muted)' : 'var(--bg-card)', transition: 'all 0.15s' }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: selectedSymbol === sym ? 'var(--accent)' : 'var(--text-primary)' }}>{sym}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Click to view</div>
                </div>
              ))}
            </div>

            {/* Selected quote */}
            <QuoteTicker symbol={selectedSymbol} />

            {/* Open Positions */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="live-dot" />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>OPEN POSITIONS</span>
              </div>
              {positions.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No open positions</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Symbol','Qty','Avg Cost','Market Val','Day P&L','P&L %'].map(h => (
                        <th key={h} style={{ padding: '8px 14px', textAlign: h === 'Symbol' ? 'left' : 'right', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos: any, i: number) => {
                      const sym      = pos.instrument?.symbol ?? '';
                      const qty      = pos.longQuantity || pos.shortQuantity || 0;
                      const avg      = pos.averagePrice ?? 0;
                      const mktVal   = pos.marketValue ?? 0;
                      const isOpt    = /^[A-Z]+\d{6}[CP]\d+$/.test(sym);
                      const mult     = isOpt ? 100 : 1;
                      const markPrice = qty > 0 ? mktVal / (qty * mult) : 0;
                      // Unrealized P&L = (mark - avg cost) × qty × multiplier
                      const unrealPnl = (markPrice - avg) * qty * mult;
                      const unrealPct = avg > 0 ? ((markPrice - avg) / avg * 100) : 0;
                      const isPos    = unrealPnl >= 0;
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '9px 14px', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>{sym}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{qty}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>${avg.toFixed(2)}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>${mktVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', color: isPos ? 'var(--green)' : 'var(--red)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                            {isPos ? '+' : ''}${unrealPnl.toFixed(2)}
                          </td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', color: isPos ? 'var(--green)' : 'var(--red)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                            {isPos ? '+' : ''}{unrealPct.toFixed(2)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Right: Market hours + performance summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Market hours */}
            <div className="card">
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 12 }}>MARKET HOURS</div>
              {[
                { session: 'Pre-Market',  hours: '4:00 AM – 9:30 AM', key: 'pre'   },
                { session: 'Regular',     hours: '9:30 AM – 4:00 PM', key: 'open'  },
                { session: 'After Hours', hours: '4:00 PM – 8:00 PM', key: 'after' },
              ].map(({ session, hours, key }) => {
                const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
                const t  = et.getHours() * 60 + et.getMinutes();
                const isActive =
                  (key === 'pre'   && t >= 240 && t < 570) ||
                  (key === 'open'  && t >= 570 && t < 960) ||
                  (key === 'after' && t >= 960 && t < 1200);
                return (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{session}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{hours}</div>
                    </div>
                    <span className={`badge ${isActive ? 'badge-green' : 'badge-amber'}`}>{isActive ? 'open' : 'closed'}</span>
                  </div>
                );
              })}
            </div>

            {/* Performance summary */}
            <div className="card">
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 12 }}>PERFORMANCE</div>
              {[
                { label: 'Today\'s Trades', value: filledToday.length / 2 },
                { label: 'Win Rate (today)', value: null },
                { label: 'Total Orders',    value: orders.length },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
                    {value !== null ? Math.floor(value as number) : '--'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
