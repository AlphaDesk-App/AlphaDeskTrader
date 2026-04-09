import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, BarChart2, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import Header from '../components/Header';
import { useAccountHash } from '../hooks/useAccountHash';
import { useLivePositions } from '../hooks/useLivePositions';
import { api } from '../services/api';

function isOption(sym: string) { return /^[A-Z]+\s*\d{6}[CP]\d+$/.test(sym.trim()); }
function formatSym(sym: string) {
  const m = sym.trim().match(/^([A-Z]+)\s*(\d{2})(\d{2})(\d{2})([CP])(\d+)$/);
  if (!m) return sym;
  const [, u, y, mo, d, type, strike] = m;
  return `${u} $${parseInt(strike)/1000}${type} ${mo}/${d}/20${y}`;
}

function pairTrades(orders: any[]) {
  const isEntry = (i: string) => i === 'BUY' || i === 'BUY_TO_OPEN';
  const isExit  = (i: string) => i === 'SELL' || i === 'SELL_TO_CLOSE' || i === 'SELL_SHORT';
  const filled  = orders
    .filter(o => o.status === 'FILLED' && o.orderLegCollection?.[0])
    .sort((a, b) => new Date(a.enteredTime ?? 0).getTime() - new Date(b.enteredTime ?? 0).getTime());
  const bySymbol: Record<string, any[]> = {};
  filled.forEach(o => {
    const sym = o.orderLegCollection[0].instrument?.symbol ?? '';
    if (!bySymbol[sym]) bySymbol[sym] = [];
    bySymbol[sym].push(o);
  });
  const trades: any[] = [];
  Object.entries(bySymbol).forEach(([sym, ords]) => {
    const mult = isOption(sym) ? 100 : 1;
    const q: any[] = [];
    ords.forEach(o => {
      const instr = (o.orderLegCollection[0].instruction ?? '').toUpperCase();
      if (isEntry(instr)) { q.push(o); }
      else if (isExit(instr) && q.length > 0) {
        const entry = q.shift();
        const qty   = Math.min(entry.filledQuantity ?? 1, o.filledQuantity ?? 1);
        const bp    = entry.orderActivityCollection?.[0]?.executionLegs?.[0]?.price ?? entry.price ?? entry.averagePrice ?? 0;
        const sp    = o.orderActivityCollection?.[0]?.executionLegs?.[0]?.price ?? o.price ?? o.averagePrice ?? 0;
        trades.push({
          entryTime: new Date(entry.enteredTime ?? Date.now()),
          pnl: (sp - bp) * qty * mult,
          win: sp > bp,
        });
      }
    });
  });
  return trades;
}

function CalendarWidget({ trades }: { trades: any[] }) {
  const [month, setMonth] = useState(new Date());
  const year = month.getFullYear(), mon = month.getMonth();
  const first = new Date(year, mon, 1).getDay();
  const days  = new Date(year, mon + 1, 0).getDate();

  const byDay: Record<number, { pnl: number; count: number; wins: number }> = {};
  trades.forEach(t => {
    if (t.entryTime.getFullYear() === year && t.entryTime.getMonth() === mon) {
      const d = t.entryTime.getDate();
      if (!byDay[d]) byDay[d] = { pnl: 0, count: 0, wins: 0 };
      byDay[d].pnl += t.pnl; byDay[d].count++; byDay[d].wins += t.win ? 1 : 0;
    }
  });

  const cells: (number|null)[] = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);

  const monthPnl   = Object.values(byDay).reduce((s, d) => s + d.pnl, 0);
  const monthTrades = Object.values(byDay).reduce((s, d) => s + d.count, 0);
  const monthWins   = Object.values(byDay).reduce((s, d) => s + d.wins, 0);

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* Calendar header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={() => setMonth(new Date(year, mon-1, 1))}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 6 }}>
          <ChevronLeft size={18}/>
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{month.toLocaleString('default', { month: 'long', year: 'numeric' })}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {monthTrades} trades · {monthWins}W {monthTrades-monthWins}L ·{' '}
            <span style={{ color: monthPnl >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
              {monthPnl >= 0 ? '+' : ''}${monthPnl.toFixed(0)}
            </span>
          </div>
        </div>
        <button onClick={() => setMonth(new Date(year, mon+1, 1))}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 6 }}>
          <ChevronRight size={18}/>
        </button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 4 }}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d =>
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', padding: '3px 0' }}>{d}</div>
        )}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i}/>;
          const data = byDay[day];
          const pos  = data && data.pnl >= 0;
          return (
            <div key={day} style={{
              minHeight: 56, borderRadius: 6, padding: '5px 6px',
              background: data ? (pos ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg-secondary)',
              border: `1px solid ${data ? (pos ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`,
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2 }}>{day}</div>
              {data && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: pos ? 'var(--green)' : 'var(--red)' }}>
                    {pos ? '+' : ''}${data.pnl.toFixed(0)}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{data.wins}W {data.count - data.wins}L</div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { accountHash }         = useAccountHash();
  const { positions }           = useLivePositions(accountHash);
  const [balances, setBalances] = useState<any>(null);
  const [orders, setOrders]     = useState<any[]>([]);

  useEffect(() => {
    if (!accountHash) return;
    api.getPortfolio(accountHash).then(d => setBalances(d?.securitiesAccount?.currentBalances ?? null)).catch(() => {});
    api.getOrders(accountHash).then(d => setOrders(d ?? [])).catch(() => {});
  }, [accountHash]);

  const calcPnlFromOrders = (orderList: any[]): number => {
    const isOpt  = (sym: string) => /^[A-Z]+\s*\d{6}[CP]\d+$/.test(sym.trim());
    const isEntry = (instr: string) => instr === 'BUY' || instr === 'BUY_TO_OPEN';
    const isExit  = (instr: string) => instr === 'SELL' || instr === 'SELL_TO_CLOSE' || instr === 'SELL_SHORT';
    const filled  = orderList.filter(o => o.status === 'FILLED' && o.orderLegCollection?.[0])
      .sort((a, b) => new Date(a.enteredTime ?? 0).getTime() - new Date(b.enteredTime ?? 0).getTime());
    const bySymbol: Record<string, any[]> = {};
    filled.forEach(o => {
      const sym = o.orderLegCollection[0].instrument?.symbol ?? '';
      if (!bySymbol[sym]) bySymbol[sym] = [];
      bySymbol[sym].push(o);
    });
    let total = 0;
    Object.entries(bySymbol).forEach(([sym, ords]) => {
      const mult = isOpt(sym) ? 100 : 1;
      const q: any[] = [];
      ords.forEach(o => {
        const instr = (o.orderLegCollection[0].instruction ?? '').toUpperCase();
        if (isEntry(instr)) { q.push(o); }
        else if (isExit(instr) && q.length > 0) {
          const entry = q.shift();
          const qty   = Math.min(entry.filledQuantity ?? 1, o.filledQuantity ?? 1);
          const bp    = entry.price ?? entry.averagePrice ?? 0;
          const sp    = o.price ?? o.averagePrice ?? 0;
          total += (sp - bp) * qty * mult;
        }
      });
    });
    return total;
  };

  const openPnl = positions.reduce((s: number, p: any) => {
    const sym  = p.instrument?.symbol ?? '';
    const qty  = p.longQuantity || p.shortQuantity || 0;
    const avg  = p.averagePrice ?? 0;
    const mktV = p.marketValue ?? 0;
    const mult = isOption(sym) ? 100 : 1;
    const mark = qty > 0 ? mktV / (qty * mult) : 0;
    return s + (mark - avg) * qty * mult;
  }, 0);

  const today    = new Date().toDateString();
  const ytdStart = new Date(new Date().getFullYear(), 0, 1);
  const dailyPnl = calcPnlFromOrders(orders.filter(o => { const t = o.closeTime ?? o.enteredTime; return t && new Date(t).toDateString() === today; }));
  const ytdPnl   = calcPnlFromOrders(orders.filter(o => { const t = o.closeTime ?? o.enteredTime; return t && new Date(t) >= ytdStart; }));

  const liquidation = balances?.liquidationValue ?? 0;
  const available   = balances?.cashAvailableForTrading ?? 0;
  const buyingPower = balances?.buyingPowerNonMarginableTrade ?? balances?.dayTradingBuyingPower ?? 0;

  const trades = useMemo(() => pairTrades(orders), [orders]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header title="Dashboard" subtitle="Account overview" />

      <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Account info + P&L cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          {[
            { label: 'Account Value',  value: `$${liquidation.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, color: 'var(--text-primary)', icon: <Zap size={14}/> },
            { label: 'Cash Available', value: `$${available.toLocaleString('en-US',  { minimumFractionDigits: 2 })}`, color: 'var(--text-primary)', icon: <Zap size={14}/> },
            { label: 'Buying Power',   value: `$${buyingPower.toLocaleString('en-US',{ minimumFractionDigits: 2 })}`, color: 'var(--text-primary)', icon: <Zap size={14}/> },
            { label: 'Open P&L',   value: `${openPnl >= 0 ? '+' : ''}$${openPnl.toFixed(2)}`,   color: openPnl >= 0 ? 'var(--green)' : 'var(--red)',   icon: <TrendingUp size={14}/> },
            { label: 'Daily P&L',  value: `${dailyPnl >= 0 ? '+' : ''}$${dailyPnl.toFixed(2)}`, color: dailyPnl >= 0 ? 'var(--green)' : 'var(--red)',  icon: <BarChart2 size={14}/> },
            { label: 'YTD P&L',    value: `${ytdPnl >= 0 ? '+' : ''}$${ytdPnl.toFixed(2)}`,     color: ytdPnl >= 0 ? 'var(--green)' : 'var(--red)',    icon: <Zap size={14}/> },
          ].map(({ label, value, color, icon }) => (
            <div key={label} className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ color: 'var(--accent)' }}>{icon}</span>{label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Open Positions */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>OPEN POSITIONS ({positions.length})</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="live-dot"/><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Live</span>
            </div>
          </div>
          {positions.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No open positions</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Symbol','Qty','Avg Cost','Mark','P&L','P&L %'].map((h, i) => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: i === 0 ? 'left' : 'right', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos: any, i: number) => {
                    const sym      = pos.instrument?.symbol ?? '';
                    const qty      = pos.longQuantity || pos.shortQuantity || 0;
                    const avg      = pos.averagePrice ?? 0;
                    const mktVal   = pos.marketValue ?? 0;
                    const isOpt    = isOption(sym);
                    const mult     = isOpt ? 100 : 1;
                    const markPrice = qty > 0 ? mktVal / (qty * mult) : 0;
                    const unrealPnl = (markPrice - avg) * qty * mult;
                    const unrealPct = avg > 0 ? ((markPrice - avg) / avg * 100) : 0;
                    const isPos    = unrealPnl >= 0;
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td style={{ padding: '9px 14px', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
                          {isOpt ? formatSym(sym) : sym}
                        </td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{qty}</td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>${avg.toFixed(2)}</td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>${markPrice.toFixed(2)}</td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: isPos ? 'var(--green)' : 'var(--red)' }}>
                          {isPos ? '+' : ''}${unrealPnl.toFixed(2)}
                        </td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: isPos ? 'var(--green)' : 'var(--red)' }}>
                          {isPos ? '+' : ''}{unrealPct.toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Trading Calendar */}
        <CalendarWidget trades={trades} />
      </div>
    </div>
  );
}
