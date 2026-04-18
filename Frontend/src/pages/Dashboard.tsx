import { useState, useMemo, useCallback } from 'react';
import {
  TrendingUp, BarChart2, Zap, ChevronLeft, ChevronRight,
  DollarSign, Percent, XCircle, Calendar,
} from 'lucide-react';
import { api } from '../services/api';
import Header from '../components/Header';
import { useApp } from '../context/AppContext';

// ── Date filter types (shared with journal) ───────────────────────────────────
const DATE_FILTERS = ['Today', 'Yesterday', 'This Week', 'This Month', 'This Year', 'Custom'] as const;
type DateFilter = typeof DATE_FILTERS[number];

function getDateRange(filter: DateFilter, customFrom: string, customTo: string): [Date, Date] {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end   = new Date(today.getTime() + 86400000 - 1);
  switch (filter) {
    case 'Today':     return [today, end];
    case 'Yesterday': { const y = new Date(today.getTime() - 86400000); return [y, new Date(today.getTime() - 1)]; }
    case 'This Week': { const mon = new Date(today.getTime() - today.getDay() * 86400000); return [mon, end]; }
    case 'This Month': return [new Date(now.getFullYear(), now.getMonth(), 1), end];
    case 'This Year':  return [new Date(now.getFullYear(), 0, 1), end];
    case 'Custom': {
      const from = customFrom ? new Date(customFrom) : today;
      const to   = customTo   ? new Date(new Date(customTo).getTime() + 86400000 - 1) : end;
      return [from, to];
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isOpt(sym: string) { return /^[A-Z]+\s*\d{6}[CP]\d+$/.test(sym.trim()); }

function formatSym(sym: string) {
  const m = sym.trim().match(/^([A-Z]+)\s*(\d{2})(\d{2})(\d{2})([CP])(\d+)$/);
  if (!m) return sym;
  const [, u, y, mo, d, type, strike] = m;
  return `${u} $${parseInt(strike) / 1000}${type} ${mo}/${d}/20${y}`;
}

function getPrice(ord: any): number {
  const execPrice = ord.orderActivityCollection?.[0]?.executionLegs?.[0]?.price;
  return execPrice ?? ord.averagePrice ?? ord.price ?? 0;
}

// FIFO partial-fill trade pairing
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
    const posQueue: Array<{ order: any; remaining: number }> = [];
    ords.forEach(o => {
      const instr   = (o.orderLegCollection[0].instruction ?? '').toUpperCase();
      const isEntry = instr === 'BUY' || instr === 'BUY_TO_OPEN';
      const isExit  = instr === 'SELL' || instr === 'SELL_TO_CLOSE' || instr === 'SELL_SHORT';
      const qty     = o.filledQuantity ?? o.quantity ?? 1;
      if (isEntry) {
        posQueue.push({ order: o, remaining: qty });
      } else if (isExit) {
        let exitRem = qty;
        while (exitRem > 0 && posQueue.length > 0) {
          const pos      = posQueue[0];
          const matchQty = Math.min(pos.remaining, exitRem);
          const bp       = getPrice(pos.order);
          const sp       = getPrice(o);
          if (bp !== 0 || sp !== 0) {
            const pnl = (sp - bp) * matchQty * mult;
            trades.push({
              symbol:    sym,
              entryTime: new Date(pos.order.enteredTime ?? Date.now()),
              exitTime:  new Date(o.enteredTime ?? Date.now()),
              pnl, win: pnl > 0, qty: matchQty,
            });
          }
          pos.remaining -= matchQty;
          exitRem       -= matchQty;
          if (pos.remaining === 0) posQueue.shift();
        }
      }
    });
  });
  return trades;
}

// ── Calendar (month + year views) ─────────────────────────────────────────────
function CalendarWidget({ trades }: { trades: any[] }) {
  const [current, setCurrent]   = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [viewMode, setViewMode] = useState<'month' | 'year'>('month');
  const { year, month } = current;

  // Aggregate by exit date
  const byDay: Record<string, { pnl: number; count: number; wins: number }> = {};
  trades.forEach(t => {
    const exitDate = t.exitTime instanceof Date ? t.exitTime : new Date(t.exitTime);
    const key = `${exitDate.getFullYear()}-${exitDate.getMonth()}-${exitDate.getDate()}`;
    if (!byDay[key]) byDay[key] = { pnl: 0, count: 0, wins: 0 };
    byDay[key].pnl += t.pnl; byDay[key].count++; byDay[key].wins += t.win ? 1 : 0;
  });

  // Monthly totals helper
  const monthSummary = (y: number, m: number) => {
    let pnl = 0, count = 0, wins = 0;
    Object.entries(byDay).forEach(([key, v]) => {
      const [ky, km] = key.split('-').map(Number);
      if (ky === y && km === m) { pnl += v.pnl; count += v.count; wins += v.wins; }
    });
    return { pnl, count, wins };
  };

  // ── Year view ────────────────────────────────────────────────────────────────
  if (viewMode === 'year') {
    return (
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button onClick={() => setCurrent(c => ({ ...c, year: c.year - 1 }))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 8px', borderRadius: 6 }}>
            <ChevronLeft size={18} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{year}</span>
            <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 8, padding: 3, gap: 2 }}>
              {(['month', 'year'] as const).map(v => (
                <button key={v} onClick={() => setViewMode(v)}
                  style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                    background: viewMode === v ? 'var(--accent)' : 'transparent',
                    color:      viewMode === v ? 'white'         : 'var(--text-muted)' }}>
                  <Calendar size={11} style={{ display: 'inline', marginRight: 4 }} />{v === 'month' ? 'Month' : 'Year'}
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => setCurrent(c => ({ ...c, year: c.year + 1 }))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 8px', borderRadius: 6 }}>
            <ChevronRight size={18} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {Array.from({ length: 12 }, (_, m) => {
            const { pnl, count, wins } = monthSummary(year, m);
            const pos = pnl >= 0;
            const mnm = new Date(year, m, 1).toLocaleString('default', { month: 'short' });
            return (
              <div key={m}
                onClick={() => { setCurrent({ year, month: m }); setViewMode('month'); }}
                style={{
                  borderRadius: 8, padding: '12px 14px', cursor: 'pointer',
                  background: count > 0 ? (pos ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg-secondary)',
                  border: `1px solid ${count > 0 ? (pos ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>{mnm}</div>
                {count > 0 ? (
                  <>
                    <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: pos ? 'var(--green)' : 'var(--red)' }}>
                      {pos ? '+' : ''}${pnl.toFixed(0)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                      {wins}W {count - wins}L · {Math.round(wins / count * 100)}%
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Month view ───────────────────────────────────────────────────────────────
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow    = new Date(year, month, 1).getDay();
  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }

  const monthData   = monthSummary(year, month);
  const monthName   = new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  const dayKey = (d: number) => `${year}-${month}-${d}`;

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button onClick={() => setCurrent(c => { const d = new Date(c.year, c.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 8px', borderRadius: 6 }}>
          <ChevronLeft size={18} />
        </button>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{monthName}</div>
            <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 8, padding: 3, gap: 2 }}>
              {(['month', 'year'] as const).map(v => (
                <button key={v} onClick={() => setViewMode(v)}
                  style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                    background: viewMode === v ? 'var(--accent)' : 'transparent',
                    color:      viewMode === v ? 'white'         : 'var(--text-muted)' }}>
                  {v === 'month' ? 'Month' : 'Year'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {monthData.count} trades · {monthData.wins}W {monthData.count - monthData.wins}L
            {monthData.count > 0 && <span> · {Math.round(monthData.wins / monthData.count * 100)}% WR</span>}
            {' · '}
            <span style={{ color: monthData.pnl >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
              {monthData.pnl >= 0 ? '+' : ''}${monthData.pnl.toFixed(0)}
            </span>
          </div>
        </div>
        <button onClick={() => setCurrent(c => { const d = new Date(c.year, c.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 8px', borderRadius: 6 }}>
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr) 80px', gap: 4, marginBottom: 4 }}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', padding: '3px 0' }}>{d}</div>
        ))}
        <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--accent)', padding: '3px 0' }}>Week</div>
      </div>

      {/* Week rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {weeks.map((wk, wi) => {
          const wkTotals = wk.reduce((acc, day) => {
            if (day) { const d = byDay[dayKey(day)]; if (d) { acc.pnl += d.pnl; acc.count += d.count; acc.wins += d.wins; } }
            return acc;
          }, { pnl: 0, count: 0, wins: 0 });
          const wkPos = wkTotals.pnl >= 0;
          return (
            <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr) 80px', gap: 4 }}>
              {wk.map((day, di) => {
                if (!day) return <div key={di} style={{ minHeight: 80 }} />;
                const data = byDay[dayKey(day)];
                const pos  = data && data.pnl >= 0;
                const wr   = data ? Math.round(data.wins / data.count * 100) : 0;
                return (
                  <div key={di} style={{
                    minHeight: 80, borderRadius: 6, padding: '6px 8px',
                    background: data ? (pos ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg-secondary)',
                    border: `1px solid ${data ? (pos ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{day}</div>
                    {data && (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: pos ? 'var(--green)' : 'var(--red)' }}>
                          {pos ? '+' : ''}${data.pnl.toFixed(0)}
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{data.wins}W {data.count - data.wins}L</div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: pos ? 'var(--green)' : 'var(--red)', marginTop: 1 }}>{wr}%</div>
                      </>
                    )}
                  </div>
                );
              })}
              {/* Weekly summary */}
              <div style={{
                minHeight: 80, borderRadius: 6, padding: '6px 8px',
                background: wkTotals.count > 0 ? (wkPos ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg-tertiary)',
                border: `1px solid ${wkTotals.count > 0 ? (wkPos ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`,
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
              }}>
                {wkTotals.count > 0 ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: wkPos ? 'var(--green)' : 'var(--red)' }}>
                      {wkPos ? '+' : ''}${wkTotals.pnl.toFixed(0)}
                    </div>
                    <div style={{ fontSize: 9, color: wkPos ? 'var(--green)' : 'var(--red)', fontWeight: 600, marginTop: 2 }}>{wkTotals.wins}W {wkTotals.count - wkTotals.wins}L</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{Math.round(wkTotals.wins / wkTotals.count * 100)}%</div>
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

// ── P&L by Symbol bar chart ───────────────────────────────────────────────────
function PnlBySymbol({ trades }: { trades: any[] }) {
  const symPnl = useMemo(() => {
    const map: Record<string, number> = {};
    trades.forEach(t => {
      const base = isOpt(t.symbol) ? t.symbol.trim().match(/^([A-Z]+)/)?.[1] ?? t.symbol : t.symbol;
      map[base] = (map[base] ?? 0) + t.pnl;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [trades]);

  if (symPnl.length === 0) return null;

  const maxAbs = Math.max(...symPnl.map(([, v]) => Math.abs(v)), 1);

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
        <BarChart2 size={13} /> P&amp;L BY SYMBOL (YTD)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {symPnl.map(([sym, pnl]) => {
          const pct = Math.abs(pnl) / maxAbs * 100;
          const pos = pnl >= 0;
          return (
            <div key={sym} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 52, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{sym}</div>
              <div style={{ flex: 1, height: 18, borderRadius: 4, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: pos ? 'var(--green)' : 'var(--red)', borderRadius: 4, opacity: 0.75 }} />
              </div>
              <div style={{ width: 72, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, color: pos ? 'var(--green)' : 'var(--red)', textAlign: 'right', flexShrink: 0 }}>
                {pos ? '+' : ''}${pnl.toFixed(0)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Filled / Rejected Orders section ─────────────────────────────────────────
function FilledRejectedOrders({ orders }: { orders: any[] }) {
  const [dateFilter, setDateFilter] = useState<DateFilter>('Today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');
  const [statusTab,  setStatusTab]  = useState<'FILLED' | 'REJECTED' | 'CANCELED'>('FILLED');

  const filtered = useMemo(() => {
    const [from, to] = getDateRange(dateFilter, customFrom, customTo);
    return orders.filter(o => {
      if (o.status !== statusTab) return false;
      const t = o.enteredTime ?? o.closeTime;
      if (!t) return false;
      const d = new Date(t);
      return d >= from && d <= to;
    });
  }, [orders, statusTab, dateFilter, customFrom, customTo]);

  const STATUS_LABELS = { FILLED: 'Filled', REJECTED: 'Rejected', CANCELED: 'Canceled' } as const;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Tab header */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 0 }}>
        {(['FILLED', 'REJECTED', 'CANCELED'] as const).map(s => (
          <button key={s} onClick={() => setStatusTab(s)}
            style={{ padding: '11px 14px', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.05em', background: 'transparent',
              color: statusTab === s ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: statusTab === s ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1, transition: 'all 0.15s' }}>
            {STATUS_LABELS[s]} ({orders.filter(o => o.status === s).length})
          </button>
        ))}

        {/* Date filter inline */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 8, padding: 3, gap: 2 }}>
            {DATE_FILTERS.map(f => (
              <button key={f} onClick={() => setDateFilter(f)}
                style={{ padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
                  background: dateFilter === f ? 'var(--accent)' : 'transparent',
                  color:      dateFilter === f ? 'white'         : 'var(--text-muted)' }}>
                {f}
              </button>
            ))}
          </div>
          {dateFilter === 'Custom' && (
            <>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ fontSize: 10, padding: '3px 6px' }} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>to</span>
              <input type="date" value={customTo}   onChange={e => setCustomTo(e.target.value)}   style={{ fontSize: 10, padding: '3px 6px' }} />
            </>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No {STATUS_LABELS[statusTab].toLowerCase()} orders in selected period</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Symbol', 'Side', 'Type', 'Qty', 'Price', 'Date/Time'].map((h, i) => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: i === 0 ? 'left' : 'right', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((order: any, idx: number) => {
                const leg  = order.orderLegCollection?.[0];
                const sym  = leg?.instrument?.symbol ?? '--';
                const side = leg?.instruction ?? '--';
                const t    = order.enteredTime ?? order.closeTime;
                return (
                  <tr key={order.orderId ?? idx} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 12 }}>
                      {isOpt(sym) ? formatSym(sym) : sym}
                    </td>
                    <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: side.includes('BUY') ? 'var(--green)' : 'var(--red)' }}>{side}</span>
                    </td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 11, color: 'var(--text-secondary)' }}>{order.orderType}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                      {order.filledQuantity ?? order.quantity}
                    </td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                      {getPrice(order) > 0 ? `$${getPrice(order).toFixed(2)}` : order.price ? `$${Number(order.price).toFixed(2)}` : 'MKT'}
                    </td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {t ? new Date(t).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'}
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

// ── Main Dashboard ────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  WORKING: 'badge-blue', PENDING_ACTIVATION: 'badge-blue',
  FILLED:  'badge-green', CANCELED: 'badge-amber', REJECTED: 'badge-red',
};

export default function Dashboard() {
  const { accountHash, positions, balances, orders, refreshOrders } = useApp();
  const [posTab,      setPosTab]      = useState<'positions' | 'working'>('positions');
  const [cancelling,  setCancelling]  = useState<number | null>(null);

  const cancel = useCallback(async (orderId: number) => {
    setCancelling(orderId);
    try {
      await api.cancelOrder(accountHash, String(orderId));
      await refreshOrders();
    } catch (e: any) {
      alert('Cancel failed: ' + e.message);
    } finally {
      setCancelling(null);
    }
  }, [accountHash, refreshOrders]);

  // Working orders
  const workingOrders = useMemo(() =>
    orders.filter(o => ['WORKING', 'PENDING_ACTIVATION'].includes(o.status)), [orders]);

  // Equity positions only (no options)
  const equityPositions = useMemo(() =>
    positions.filter((p: any) => !isOpt(p.instrument?.symbol ?? '')), [positions]);

  // Open unrealized P&L (equity only for display, options excluded)
  const openPnl = positions.reduce((s: number, p: any) => {
    const sym  = p.instrument?.symbol ?? '';
    const qty  = p.longQuantity || p.shortQuantity || 0;
    const avg  = p.averagePrice ?? 0;
    const mktV = p.marketValue ?? 0;
    const mult = isOpt(sym) ? 100 : 1;
    return s + (mktV - avg * qty * mult);
  }, 0);

  const todayStr = new Date().toDateString();
  const ytdStart = new Date(new Date().getFullYear(), 0, 1);

  // All paired closed trades
  const trades = useMemo(() => pairTrades(orders), [orders]);

  // Daily P&L
  const dailyTrades = useMemo(() => {
    const todayOrders = orders.filter(o => {
      const t = o.enteredTime ?? o.closeTime;
      return t && new Date(t).toDateString() === todayStr;
    });
    return pairTrades(todayOrders);
  }, [orders, todayStr]);
  const dailyPnl = dailyTrades.reduce((s, t) => s + t.pnl, 0);

  // YTD realized P&L
  const realizedYtd = trades.filter(t => t.exitTime >= ytdStart).reduce((s, t) => s + t.pnl, 0);
  const ytdPnl      = realizedYtd + openPnl;

  const liquidation = balances?.liquidationValue ?? 0;
  const available   = balances?.cashAvailableForTrading ?? 0;
  const buyingPower = balances?.buyingPowerNonMarginableTrade ?? balances?.dayTradingBuyingPower ?? 0;

  const sodValue    = liquidation - dailyPnl;
  const dailyPnlPct = sodValue > 0 ? (dailyPnl / sodValue) * 100 : 0;
  const ytdPnlPct   = (liquidation - ytdPnl) > 0 ? (ytdPnl / (liquidation - ytdPnl)) * 100 : 0;

  const fmt$   = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });
  const fmtPnl = (n: number) => `${n >= 0 ? '+' : ''}$${n.toFixed(2)}`;
  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

  const pnlCards = [
    { label: 'Account Value',  value: `$${fmt$(liquidation)}`, color: 'var(--text-primary)',                                  icon: <DollarSign size={13} /> },
    { label: 'Cash Available', value: `$${fmt$(available)}`,   color: 'var(--text-primary)',                                  icon: <Zap size={13} /> },
    { label: 'Buying Power',   value: `$${fmt$(buyingPower)}`, color: 'var(--text-primary)',                                  icon: <Zap size={13} /> },
    { label: 'Open P&L',       value: fmtPnl(openPnl),        color: openPnl  >= 0 ? 'var(--green)' : 'var(--red)',          icon: <TrendingUp size={13} /> },
    { label: 'Daily P&L',      value: fmtPnl(dailyPnl),       color: dailyPnl >= 0 ? 'var(--green)' : 'var(--red)',          icon: <BarChart2 size={13} /> },
    { label: 'Daily P&L %',    value: fmtPct(dailyPnlPct),    color: dailyPnlPct >= 0 ? 'var(--green)' : 'var(--red)',       icon: <Percent size={13} /> },
    { label: 'YTD P&L',        value: fmtPnl(ytdPnl),         color: ytdPnl   >= 0 ? 'var(--green)' : 'var(--red)',          icon: <TrendingUp size={13} /> },
    { label: 'YTD P&L %',      value: fmtPct(ytdPnlPct),      color: ytdPnlPct >= 0 ? 'var(--green)' : 'var(--red)',         icon: <Percent size={13} /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header title="Dashboard" subtitle="Account overview" />
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── P&L Summary Cards ─────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {pnlCards.map(({ label, value, color, icon }) => (
            <div key={label} className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ color: 'var(--accent)' }}>{icon}</span>{label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* ── Trading Calendar ───────────────────────────────────────────────── */}
        <CalendarWidget trades={trades} />

        {/* ── P&L by Symbol ─────────────────────────────────────────────────── */}
        <PnlBySymbol trades={trades} />

        {/* ── Positions + Working Orders ─────────────────────────────────────── */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Tab header */}
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
            {([
              { key: 'positions', label: `POSITIONS (${equityPositions.length})` },
              { key: 'working',   label: `WORKING ORDERS (${workingOrders.length})` },
            ] as const).map(({ key, label }) => (
              <button key={key} onClick={() => setPosTab(key)}
                style={{ padding: '11px 16px', border: 'none', cursor: 'pointer', fontSize: 11,
                  fontWeight: 600, letterSpacing: '0.05em', background: 'transparent',
                  color: posTab === key ? 'var(--accent)' : 'var(--text-muted)',
                  borderBottom: posTab === key ? '2px solid var(--accent)' : '2px solid transparent',
                  marginBottom: -1, transition: 'all 0.15s' }}>
                {label}
              </button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, paddingRight: 16 }}>
              <div className="live-dot" /><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Live</span>
            </div>
          </div>

          {/* Positions tab — equity only */}
          {posTab === 'positions' && (
            equityPositions.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No open equity positions</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Symbol', 'Qty', 'Avg Cost', 'Mark', 'P&L', 'P&L %'].map((h, i) => (
                        <th key={h} style={{ padding: '8px 14px', textAlign: i === 0 ? 'left' : 'right', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {equityPositions.map((pos: any, i: number) => {
                      const qty    = pos.longQuantity || pos.shortQuantity || 0;
                      const avg    = pos.averagePrice ?? 0;
                      const mktVal = pos.marketValue ?? 0;
                      const pnl    = mktVal - avg * qty;
                      const pct    = avg > 0 ? (pnl / (avg * qty)) * 100 : 0;
                      const mark   = qty > 0 ? mktVal / qty : 0;
                      const up     = pnl >= 0;
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <td style={{ padding: '9px 14px', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{pos.instrument?.symbol ?? '--'}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{qty}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>${avg.toFixed(2)}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>${mark.toFixed(2)}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: up ? 'var(--green)' : 'var(--red)' }}>{up ? '+' : ''}${pnl.toFixed(2)}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: up ? 'var(--green)' : 'var(--red)' }}>{up ? '+' : ''}{pct.toFixed(2)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Working Orders tab */}
          {posTab === 'working' && (
            workingOrders.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No working orders</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Symbol', 'Side', 'Type', 'Qty', 'Filled', 'Price', 'Status', 'Time', ''].map((h, i) => (
                        <th key={i} style={{ padding: '8px 14px', textAlign: i === 0 ? 'left' : 'right', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {workingOrders.map((order: any) => {
                      const leg  = order.orderLegCollection?.[0];
                      const sym  = leg?.instrument?.symbol ?? '--';
                      const side = leg?.instruction ?? '--';
                      return (
                        <tr key={order.orderId} style={{ borderBottom: '1px solid var(--border)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <td style={{ padding: '9px 14px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 12 }}>{sym}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: side.includes('BUY') ? 'var(--green)' : 'var(--red)' }}>{side}</span>
                          </td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 11, color: 'var(--text-secondary)' }}>{order.orderType}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{order.quantity}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{order.filledQuantity}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{order.price ? `$${Number(order.price).toFixed(2)}` : 'MKT'}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                            <span className={`badge ${STATUS_COLORS[order.status] ?? 'badge-amber'}`}>{order.status}</span>
                          </td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {order.enteredTime ? new Date(order.enteredTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                          </td>
                          <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                            <button onClick={() => cancel(order.orderId)} disabled={cancelling === order.orderId}
                              style={{ background: 'var(--red-bg)', border: 'none', borderRadius: 5, padding: '3px 6px', cursor: 'pointer', color: 'var(--red)', opacity: cancelling === order.orderId ? 0.5 : 1 }}>
                              <XCircle size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

        {/* ── Filled / Rejected / Canceled Orders ───────────────────────────── */}
        <FilledRejectedOrders orders={orders} />

      </div>
    </div>
  );
}
