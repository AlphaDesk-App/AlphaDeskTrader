import { useState, useMemo } from 'react';
import { TrendingUp, BarChart2, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import Header from '../components/Header';
import { useApp } from '../context/AppContext';

// ── Helpers ───────────────────────────────────────────────────────────────────
function isOpt(sym: string) { return /^[A-Z]+\s*\d{6}[CP]\d+$/.test(sym.trim()); }

function formatSym(sym: string) {
  const m = sym.trim().match(/^([A-Z]+)\s*(\d{2})(\d{2})(\d{2})([CP])(\d+)$/);
  if (!m) return sym;
  const [, u, y, mo, d, type, strike] = m;
  return `${u} $${parseInt(strike)/1000}${type} ${mo}/${d}/20${y}`;
}

function calcPnl(orders: any[]): number {
  const filled = orders
    .filter(o => o.status === 'FILLED' && o.orderLegCollection?.[0])
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
      if (instr === 'BUY' || instr === 'BUY_TO_OPEN') { q.push(o); }
      else if ((instr === 'SELL' || instr === 'SELL_TO_CLOSE' || instr === 'SELL_SHORT') && q.length > 0) {
        const entry = q.shift();
        const qty   = Math.min(entry.filledQuantity ?? 1, o.filledQuantity ?? 1);
        total += ((o.averagePrice || o.price || 0) - (entry.averagePrice || entry.price || 0)) * qty * mult;
      }
    });
  });
  return total;
}

function pairTrades(orders: any[]) {
  const filled = orders
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
    const mult = isOpt(sym) ? 100 : 1;
    const q: any[] = [];
    ords.forEach(o => {
      const instr = (o.orderLegCollection[0].instruction ?? '').toUpperCase();
      if (instr === 'BUY' || instr === 'BUY_TO_OPEN') { q.push(o); }
      else if ((instr === 'SELL' || instr === 'SELL_TO_CLOSE' || instr === 'SELL_SHORT') && q.length > 0) {
        const entry = q.shift();
        const qty   = Math.min(entry.filledQuantity ?? 1, o.filledQuantity ?? 1);
        const bp    = entry.averagePrice || entry.price || 0;
        const sp    = o.averagePrice || o.price || 0;
        const pnl   = (sp - bp) * qty * mult;
        trades.push({ entryTime: new Date(entry.enteredTime ?? Date.now()), pnl, win: pnl > 0 });
      }
    });
  });
  return trades;
}

// ── Market Status ─────────────────────────────────────────────────────────────
function MarketStatusCard() {
  const et        = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const t         = et.getHours() * 60 + et.getMinutes();
  const dow       = et.getDay();
  const isWeekend = dow === 0 || dow === 6;
  const sessions  = [
    { label: 'Pre-Market',  hours: '4:00–9:30a',  key: 'pre',   active: !isWeekend && t >= 240 && t < 570  },
    { label: 'Regular',     hours: '9:30a–4:00p', key: 'open',  active: !isWeekend && t >= 570 && t < 960  },
    { label: 'After Hours', hours: '4:00–8:00p',  key: 'after', active: !isWeekend && t >= 960 && t < 1200 },
  ];
  const active = sessions.find(s => s.active);
  const label  = isWeekend ? 'Weekend' : active ? active.label : 'Closed';
  const color  = active ? 'var(--green)' : 'var(--text-muted)';

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8 }}>MARKET STATUS</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: active ? 'var(--green)' : 'var(--border)', boxShadow: active ? '0 0 6px var(--green)' : 'none', flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 14, color }}>{label}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {et.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })} ET
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {sessions.map(s => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: s.active ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: s.active ? 600 : 400 }}>{s.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{s.hours}</span>
              <span className={`badge ${s.active ? 'badge-green' : 'badge-amber'}`} style={{ fontSize: 9, padding: '1px 5px' }}>{s.active ? 'OPEN' : 'CLOSED'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Calendar ──────────────────────────────────────────────────────────────────
function CalendarWidget({ trades }: { trades: any[] }) {
  const [current, setCurrent] = useState(() => {
    const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() };
  });
  const { year, month } = current;

  const byDay: Record<number, { pnl: number; count: number; wins: number }> = {};
  trades.forEach(t => {
    if (t.entryTime.getFullYear() === year && t.entryTime.getMonth() === month) {
      const d = t.entryTime.getDate();
      if (!byDay[d]) byDay[d] = { pnl: 0, count: 0, wins: 0 };
      byDay[d].pnl += t.pnl; byDay[d].count++; byDay[d].wins += t.win ? 1 : 0;
    }
  });

  // Build week rows
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const monthPnl    = Object.values(byDay).reduce((s, d) => s + d.pnl, 0);
  const monthTrades = Object.values(byDay).reduce((s, d) => s + d.count, 0);
  const monthWins   = Object.values(byDay).reduce((s, d) => s + d.wins, 0);

  const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  const prev = () => setCurrent(c => {
    const d = new Date(c.year, c.month - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const next = () => setCurrent(c => {
    const d = new Date(c.year, c.month + 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button onClick={prev} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 8px', borderRadius: 6 }}>
          <ChevronLeft size={18} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{monthName}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {monthTrades} trades · {monthWins}W {monthTrades - monthWins}L ·{' '}
            <span style={{ color: monthPnl >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
              {monthPnl >= 0 ? '+' : ''}${monthPnl.toFixed(0)}
            </span>
          </div>
        </div>
        <button onClick={next} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 8px', borderRadius: 6 }}>
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Day headers + Week header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr) 80px', gap: 3, marginBottom: 3 }}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', padding: '3px 0' }}>{d}</div>
        ))}
        <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--accent)', padding: '3px 0' }}>Week</div>
      </div>

      {/* Week rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {weeks.map((wk, wi) => {
          const wkTotals = wk.reduce((acc, day) => {
            if (day && byDay[day]) {
              acc.pnl += byDay[day].pnl;
              acc.count += byDay[day].count;
              acc.wins += byDay[day].wins;
            }
            return acc;
          }, { pnl: 0, count: 0, wins: 0 });
          const wkPos = wkTotals.pnl >= 0;

          return (
            <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr) 80px', gap: 3 }}>
              {wk.map((day, di) => {
                if (!day) return <div key={di} style={{ minHeight: 54 }} />;
                const data = byDay[day];
                const pos  = data && data.pnl >= 0;
                return (
                  <div key={di} style={{
                    minHeight: 54, borderRadius: 6, padding: '5px 6px',
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

              {/* Weekly summary */}
              <div style={{
                minHeight: 54, borderRadius: 6, padding: '6px 8px',
                background: wkTotals.count > 0 ? (wkPos ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg-tertiary)',
                border: `1px solid ${wkTotals.count > 0 ? (wkPos ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`,
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
              }}>
                {wkTotals.count > 0 ? (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: wkPos ? 'var(--green)' : 'var(--red)' }}>
                      {wkPos ? '+' : ''}${wkTotals.pnl.toFixed(0)}
                    </div>
                    <div style={{ fontSize: 9, color: wkPos ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                      {wkTotals.wins}W {wkTotals.count - wkTotals.wins}L
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                      {Math.round(wkTotals.wins / wkTotals.count * 100)}%
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center' }}>—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { accountHash, positions, balances, orders } = useApp();

  const openPnl = positions.reduce((s: number, p: any) => {
    const sym   = p.instrument?.symbol ?? '';
    const qty   = p.longQuantity || p.shortQuantity || 0;
    const avg   = p.averagePrice ?? 0;
    const mktV  = p.marketValue ?? 0;
    const mult  = isOpt(sym) ? 100 : 1;
    const mark  = qty > 0 ? mktV / (qty * mult) : 0;
    return s + (mark - avg) * qty * mult;
  }, 0);

  const todayStr = new Date().toDateString();
  const ytdStart = new Date(new Date().getFullYear(), 0, 1);

  const dailyPnl = calcPnl(orders.filter(o => {
    const t = o.closeTime ?? o.enteredTime;
    return t && new Date(t).toDateString(