import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  TrendingUp, BarChart2, Zap, ChevronLeft, ChevronRight,
  DollarSign, Percent, XCircle, Calendar, Clock,
} from 'lucide-react';
import { api } from '../services/api';
import Header from '../components/Header';
import { useApp } from '../context/AppContext';

// ── Date filter ───────────────────────────────────────────────────────────────
const DATE_FILTERS = ['Today', 'Yesterday', 'This Week', 'This Month', 'This Year', 'Custom'] as const;
type DateFilter = typeof DATE_FILTERS[number];

function getDateRange(filter: DateFilter, customFrom: string, customTo: string): [Date, Date] {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end   = new Date(today.getTime() + 86400000 - 1);
  switch (filter) {
    case 'Today':      return [today, end];
    case 'Yesterday':  { const y = new Date(today.getTime() - 86400000); return [y, new Date(today.getTime() - 1)]; }
    case 'This Week':  { const mon = new Date(today.getTime() - today.getDay() * 86400000); return [mon, end]; }
    case 'This Month': return [new Date(now.getFullYear(), now.getMonth(), 1), end];
    case 'This Year':  return [new Date(now.getFullYear(), 0, 1), end];
    case 'Custom': {
      const from = customFrom ? new Date(customFrom) : today;
      const to   = customTo   ? new Date(new Date(customTo).getTime() + 86400000 - 1) : end;
      return [from, to];
    }
  }
}

function DateFilterBar({
  value, onChange, customFrom, customTo,
  onCustomFrom, onCustomTo,
}: {
  value: DateFilter; onChange: (f: DateFilter) => void;
  customFrom: string; customTo: string;
  onCustomFrom: (v: string) => void; onCustomTo: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 8, padding: 3, gap: 2 }}>
        {DATE_FILTERS.map(f => (
          <button key={f} onClick={() => onChange(f)}
            style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
              background: value === f ? 'var(--accent)' : 'transparent',
              color:      value === f ? 'white'         : 'var(--text-muted)' }}>
            {f}
          </button>
        ))}
      </div>
      {value === 'Custom' && (
        <>
          <input type="date" value={customFrom} onChange={e => onCustomFrom(e.target.value)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>to</span>
          <input type="date" value={customTo}   onChange={e => onCustomTo(e.target.value)}   style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
        </>
      )}
    </div>
  );
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

// FIFO partial-fill trade pairing — includes id so journal notes can be merged
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
              id:        `${pos.order.orderId}-${o.orderId}`,
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

// ── Calendar ──────────────────────────────────────────────────────────────────
function CalendarWidget({ trades }: { trades: any[] }) {
  const [current, setCurrent]   = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [viewMode, setViewMode] = useState<'month' | 'year'>('month');
  const { year, month } = current;

  const byDay: Record<string, { pnl: number; count: number; wins: number }> = {};
  trades.forEach(t => {
    const d = t.exitTime instanceof Date ? t.exitTime : new Date(t.exitTime);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!byDay[key]) byDay[key] = { pnl: 0, count: 0, wins: 0 };
    byDay[key].pnl += t.pnl; byDay[key].count++; byDay[key].wins += t.win ? 1 : 0;
  });

  const monthSummary = (y: number, m: number) => {
    let pnl = 0, count = 0, wins = 0;
    Object.entries(byDay).forEach(([key, v]) => {
      const [ky, km] = key.split('-').map(Number);
      if (ky === y && km === m) { pnl += v.pnl; count += v.count; wins += v.wins; }
    });
    return { pnl, count, wins };
  };

  const ViewToggle = () => (
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
  );

  // Year view
  if (viewMode === 'year') {
    return (
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button onClick={() => setCurrent(c => ({ ...c, year: c.year - 1 }))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 8px', borderRadius: 6 }}><ChevronLeft size={18} /></button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{year}</span>
            <ViewToggle />
          </div>
          <button onClick={() => setCurrent(c => ({ ...c, year: c.year + 1 }))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 8px', borderRadius: 6 }}><ChevronRight size={18} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {Array.from({ length: 12 }, (_, m) => {
            const { pnl, count, wins } = monthSummary(year, m);
            const pos = pnl >= 0;
            return (
              <div key={m} onClick={() => { setCurrent({ year, month: m }); setViewMode('month'); }}
                style={{ borderRadius: 8, padding: '12px 14px', cursor: 'pointer',
                  background: count > 0 ? (pos ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg-secondary)',
                  border: `1px solid ${count > 0 ? (pos ? 'var(--green)' : 'var(--red)') : 'var(--border)'}` }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>
                  {new Date(year, m, 1).toLocaleString('default', { month: 'short' })}
                </div>
                {count > 0 ? (
                  <>
                    <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: pos ? 'var(--green)' : 'var(--red)' }}>{pos ? '+' : ''}${pnl.toFixed(0)}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{wins}W {count - wins}L · {Math.round(wins / count * 100)}%</div>
                  </>
                ) : <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Month view
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow    = new Date(year, month, 1).getDay();
  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }

  const monthData = monthSummary(year, month);
  const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  const dayKey    = (d: number) => `${year}-${month}-${d}`;

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button onClick={() => setCurrent(c => { const d = new Date(c.year, c.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 8px', borderRadius: 6 }}><ChevronLeft size={18} /></button>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{monthName}</div>
            <ViewToggle />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {monthData.count} trades · {monthData.wins}W {monthData.count - monthData.wins}L
            {monthData.count > 0 && <> · {Math.round(monthData.wins / monthData.count * 100)}% WR</>}
            {' · '}
            <span style={{ color: monthData.pnl >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
              {monthData.pnl >= 0 ? '+' : ''}${monthData.pnl.toFixed(0)}
            </span>
          </div>
        </div>
        <button onClick={() => setCurrent(c => { const d = new Date(c.year, c.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 8px', borderRadius: 6 }}><ChevronRight size={18} /></button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr) 80px', gap: 4, marginBottom: 4 }}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', padding: '3px 0' }}>{d}</div>
        ))}
        <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--accent)', padding: '3px 0' }}>Week</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {weeks.map((wk, wi) => {
          const wkT = wk.reduce((a, day) => {
            if (day) { const d = byDay[dayKey(day)]; if (d) { a.pnl += d.pnl; a.count += d.count; a.wins += d.wins; } }
            return a;
          }, { pnl: 0, count: 0, wins: 0 });
          const wkPos = wkT.pnl >= 0;
          return (
            <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr) 80px', gap: 4 }}>
              {wk.map((day, di) => {
                if (!day) return <div key={di} style={{ minHeight: 80 }} />;
                const data = byDay[dayKey(day)];
                const pos  = data && data.pnl >= 0;
                return (
                  <div key={di} style={{ minHeight: 80, borderRadius: 6, padding: '6px 8px',
                    background: data ? (pos ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg-secondary)',
                    border: `1px solid ${data ? (pos ? 'var(--green)' : 'var(--red)') : 'var(--border)'}` }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{day}</div>
                    {data && (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: pos ? 'var(--green)' : 'var(--red)' }}>
                          {pos ? '+' : ''}${data.pnl.toFixed(0)}
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{data.wins}W {data.count - data.wins}L</div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: pos ? 'var(--green)' : 'var(--red)', marginTop: 1 }}>
                          {Math.round(data.wins / data.count * 100)}%
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              <div style={{ minHeight: 80, borderRadius: 6, padding: '6px 8px',
                background: wkT.count > 0 ? (wkPos ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg-tertiary)',
                border: `1px solid ${wkT.count > 0 ? (wkPos ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`,
                display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {wkT.count > 0 ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: wkPos ? 'var(--green)' : 'var(--red)' }}>
                      {wkPos ? '+' : ''}${wkT.pnl.toFixed(0)}
                    </div>
                    <div style={{ fontSize: 9, color: wkPos ? 'var(--green)' : 'var(--red)', fontWeight: 600, marginTop: 2 }}>{wkT.wins}W {wkT.count - wkT.wins}L</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{Math.round(wkT.wins / wkT.count * 100)}%</div>
                  </>
                ) : <div style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center' }}>—</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── P&L Line Graph ────────────────────────────────────────────────────────────
function PnlLineGraph({ allTrades }: { allTrades: any[] }) {
  const [filter,     setFilter]     = useState<DateFilter>('This Month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');
  const [hoverIdx,   setHoverIdx]   = useState<number | null>(null);

  // Build cumulative equity curve within the selected date range
  const { points, minPnl, maxPnl, totalPnl, winCount, tradeCount } = useMemo(() => {
    const [from, to] = getDateRange(filter, customFrom, customTo);
    const filtered = allTrades
      .filter(t => t.exitTime >= from && t.exitTime <= to)
      .sort((a, b) => a.exitTime.getTime() - b.exitTime.getTime());

    let cum = 0;
    const pts = [{ cum: 0, trade: null as any, date: from }];
    filtered.forEach(t => { cum += t.pnl; pts.push({ cum, trade: t, date: t.exitTime }); });

    const vals  = pts.map(p => p.cum);
    const wins  = filtered.filter(t => t.win).length;
    return {
      points:     pts,
      minPnl:     Math.min(...vals, 0),
      maxPnl:     Math.max(...vals, 0),
      totalPnl:   cum,
      winCount:   wins,
      tradeCount: filtered.length,
    };
  }, [allTrades, filter, customFrom, customTo]);

  const W = 760, H = 180, PAD = { t: 16, r: 16, b: 32, l: 64 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const range  = maxPnl - minPnl || 1;
  const toX    = (i: number) => PAD.l + (i / Math.max(points.length - 1, 1)) * innerW;
  const toY    = (v: number) => PAD.t + ((maxPnl - v) / range) * innerH;
  const zeroY  = toY(0);

  // Build SVG path string
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.cum).toFixed(1)}`).join(' ');
  // Closed path for fill (trace line then close along bottom/top)
  const closedPath = (clip: 'above' | 'below') => {
    const pts2 = points.map((p, i) => `${toX(i).toFixed(1)},${toY(p.cum).toFixed(1)}`).join(' L');
    const last  = toX(points.length - 1).toFixed(1);
    const first = toX(0).toFixed(1);
    return `M${first},${zeroY.toFixed(1)} L${pts2} L${last},${zeroY.toFixed(1)} Z`;
  };

  // Y-axis labels
  const yTicks = 5;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const val = minPnl + (range / yTicks) * i;
    return { val, y: toY(val) };
  });

  // X-axis date labels (up to 6)
  const xStep = Math.max(1, Math.floor(points.length / 6));
  const xLabels = points
    .filter((_, i) => i === 0 || i === points.length - 1 || i % xStep === 0)
    .map((p, _, arr) => ({ label: p.date.toLocaleDateString([], { month: 'short', day: 'numeric' }), x: toX(points.indexOf(p)) }));

  const hov = hoverIdx !== null && hoverIdx < points.length ? points[hoverIdx] : null;

  if (tradeCount === 0) return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
        <TrendingUp size={14} /> P&amp;L EQUITY CURVE
      </div>
      <DateFilterBar value={filter} onChange={setFilter} customFrom={customFrom} customTo={customTo} onCustomFrom={setCustomFrom} onCustomTo={setCustomTo} />
      <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginTop: 12 }}>No trades in selected period</div>
    </div>
  );

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <TrendingUp size={14} /> P&amp;L EQUITY CURVE
          </div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 20, fontWeight: 700, color: totalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {tradeCount} trades · {winCount}W {tradeCount - winCount}L · {tradeCount > 0 ? Math.round(winCount / tradeCount * 100) : 0}% WR
          </div>
        </div>
        <DateFilterBar value={filter} onChange={setFilter} customFrom={customFrom} customTo={customTo} onCustomFrom={setCustomFrom} onCustomTo={setCustomTo} />
      </div>

      {/* SVG Chart */}
      <div style={{ position: 'relative', userSelect: 'none' }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}
          onMouseMove={e => {
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const svgX  = ((e.clientX - rect.left) / rect.width) * W;
            const relX  = svgX - PAD.l;
            const idx   = Math.round((relX / innerW) * (points.length - 1));
            setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)));
          }}
          onMouseLeave={() => setHoverIdx(null)}>
          <defs>
            {/* Clip above zero → green fill */}
            <clipPath id="clip-above">
              <rect x={PAD.l} y={PAD.t} width={innerW} height={Math.max(0, zeroY - PAD.t)} />
            </clipPath>
            {/* Clip below zero → red fill */}
            <clipPath id="clip-below">
              <rect x={PAD.l} y={zeroY} width={innerW} height={Math.max(0, PAD.t + innerH - zeroY)} />
            </clipPath>
          </defs>

          {/* Y-axis grid lines */}
          {yLabels.map(({ val, y }, i) => (
            <g key={i}>
              <line x1={PAD.l} y1={y} x2={PAD.l + innerW} y2={y}
                stroke={val === 0 ? '#4b5563' : '#1f2937'} strokeWidth={val === 0 ? 1 : 0.5} strokeDasharray={val === 0 ? '' : '3,3'} />
              <text x={PAD.l - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#6b7280" fontFamily="monospace">
                {val >= 0 ? '+' : ''}{val >= 1000 || val <= -1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0)}
              </text>
            </g>
          ))}

          {/* Green fill (above zero) */}
          <path d={closedPath('above')} fill="var(--green)" fillOpacity={0.15} clipPath="url(#clip-above)" />
          {/* Red fill (below zero) */}
          <path d={closedPath('below')} fill="var(--red)" fillOpacity={0.15} clipPath="url(#clip-below)" />

          {/* Main line — green segment */}
          <path d={pathD} fill="none" stroke="var(--green)" strokeWidth={2} clipPath="url(#clip-above)" strokeLinecap="round" strokeLinejoin="round" />
          {/* Main line — red segment */}
          <path d={pathD} fill="none" stroke="var(--red)" strokeWidth={2} clipPath="url(#clip-below)" strokeLinecap="round" strokeLinejoin="round" />

          {/* X-axis labels */}
          {xLabels.map(({ label, x }, i) => (
            <text key={i} x={x} y={H - 6} textAnchor="middle" fontSize={9} fill="#6b7280" fontFamily="sans-serif">{label}</text>
          ))}

          {/* Hover crosshair */}
          {hov && hoverIdx !== null && (
            <g>
              <line x1={toX(hoverIdx)} y1={PAD.t} x2={toX(hoverIdx)} y2={PAD.t + innerH}
                stroke="#6b7280" strokeWidth={1} strokeDasharray="4,3" />
              <circle cx={toX(hoverIdx)} cy={toY(hov.cum)} r={4}
                fill={hov.cum >= 0 ? 'var(--green)' : 'var(--red)'} stroke="var(--bg-card)" strokeWidth={2} />
              {/* Tooltip bubble */}
              {(() => {
                const bx  = Math.min(toX(hoverIdx) + 8, W - 130);
                const by  = Math.max(toY(hov.cum) - 44, PAD.t);
                const pos = hov.cum >= 0;
                return (
                  <g>
                    <rect x={bx} y={by} width={122} height={40} rx={5} fill="var(--bg-secondary)" stroke={pos ? 'var(--green)' : 'var(--red)'} strokeWidth={1} />
                    <text x={bx + 8} y={by + 14} fontSize={10} fontWeight="bold" fill={pos ? 'var(--green)' : 'var(--red)'} fontFamily="monospace">
                      {pos ? '+' : ''}${hov.cum.toFixed(2)}
                    </text>
                    <text x={bx + 8} y={by + 28} fontSize={9} fill="#9ca3af" fontFamily="sans-serif">
                      {hov.date.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' })}
                      {hov.trade ? `  ${hov.trade.win ? '▲' : '▼'} $${Math.abs(hov.trade.pnl).toFixed(0)}` : '  Start'}
                    </text>
                  </g>
                );
              })()}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

// ── P&L by Symbol ─────────────────────────────────────────────────────────────
function PnlBySymbol({ trades }: { trades: any[] }) {
  const symPnl = useMemo(() => {
    const map: Record<string, number> = {};
    trades.forEach(t => {
      const base = isOpt(t.symbol) ? (t.symbol.trim().match(/^([A-Z]+)/)?.[1] ?? t.symbol) : t.symbol;
      map[base] = (map[base] ?? 0) + t.pnl;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [trades]);

  if (symPnl.length === 0) return null;
  const maxAbs = Math.max(...symPnl.map(([, v]) => Math.abs(v)), 1);

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
        <BarChart2 size={14} /> P&amp;L BY SYMBOL
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {symPnl.map(([sym, pnl]) => {
          const pct = Math.abs(pnl) / maxAbs * 100;
          const pos = pnl >= 0;
          return (
            <div key={sym} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 60, fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{sym}</div>
              <div style={{ flex: 1, height: 22, borderRadius: 4, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: pos ? 'var(--green)' : 'var(--red)', borderRadius: 4, opacity: 0.75 }} />
              </div>
              <div style={{ width: 80, fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: pos ? 'var(--green)' : 'var(--red)', textAlign: 'right', flexShrink: 0 }}>
                {pos ? '+' : ''}${pnl.toFixed(0)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── P&L by Setup ──────────────────────────────────────────────────────────────
function PnlBySetup({ trades, notes }: { trades: any[]; notes: Record<string, { setup: string; notes: string }> }) {
  const setupPnl = useMemo(() => {
    const map: Record<string, { pnl: number; count: number; wins: number }> = {};
    trades.forEach(t => {
      const setup = notes[t.id]?.setup || 'Untagged';
      if (!map[setup]) map[setup] = { pnl: 0, count: 0, wins: 0 };
      map[setup].pnl += t.pnl; map[setup].count++; if (t.win) map[setup].wins++;
    });
    return Object.entries(map).sort((a, b) => b[1].pnl - a[1].pnl);
  }, [trades, notes]);

  if (setupPnl.length === 0) return null;
  const maxAbs = Math.max(...setupPnl.map(([, v]) => Math.abs(v.pnl)), 1);

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Zap size={14} /> P&amp;L BY SETUP
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {setupPnl.map(([setup, { pnl, count, wins }]) => {
          const pct = Math.abs(pnl) / maxAbs * 100;
          const pos = pnl >= 0;
          const wr  = Math.round(wins / count * 100);
          return (
            <div key={setup} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 200, fontSize: 13, fontWeight: 500, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={setup}>{setup}</div>
              <div style={{ flex: 1, height: 22, borderRadius: 4, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: pos ? 'var(--green)' : 'var(--red)', borderRadius: 4, opacity: 0.75 }} />
              </div>
              <div style={{ display: 'flex', gap: 14, flexShrink: 0, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>{count}T · {wr}%WR</span>
                <div style={{ width: 80, fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: pos ? 'var(--green)' : 'var(--red)', textAlign: 'right' }}>
                  {pos ? '+' : ''}${pnl.toFixed(0)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── P&L by Time of Day ────────────────────────────────────────────────────────
function PnlByTimeOfDay({ trades }: { trades: any[] }) {
  const hourStats = useMemo(() => {
    const map: Record<number, { pnl: number; count: number; wins: number }> = {};
    trades.forEach(t => {
      // Convert entry time to MT for hour bucketing
      const etStr = t.entryTime.toLocaleString('en-US', { timeZone: 'America/Denver', hour: 'numeric', hour12: false });
      const h = parseInt(etStr);
      if (isNaN(h)) return;
      if (!map[h]) map[h] = { pnl: 0, count: 0, wins: 0 };
      map[h].pnl += t.pnl; map[h].count++; if (t.win) map[h].wins++;
    });
    return map;
  }, [trades]);

  const hours   = Array.from({ length: 8 }, (_, i) => i + 7); // 7am–2pm MT
  const maxAbs  = Math.max(...Object.values(hourStats).map(h => Math.abs(h.pnl)), 1);
  const hasData = Object.keys(hourStats).length > 0;

  if (!hasData) return null;

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Clock size={14} /> P&amp;L BY TIME OF DAY (MT)
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 220 }}>
        {hours.map(h => {
          const d   = hourStats[h];
          const pnl = d?.pnl ?? 0;
          const ht  = d ? Math.max(12, Math.abs(pnl) / maxAbs * 190) : 12;
          const col = pnl > 0 ? 'var(--green)' : pnl < 0 ? 'var(--red)' : 'var(--border)';
          const lbl = h > 12 ? `${h - 12}p` : h === 12 ? '12p' : `${h}a`;
          return (
            <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ fontSize: 12, color: col, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, textAlign: 'center', minHeight: 16 }}>
                {d ? `${pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}` : ''}
              </div>
              <div style={{ width: '100%', height: ht, background: col, borderRadius: 4, minHeight: 12 }}
                title={d ? `${d.wins}W ${d.count - d.wins}L · $${pnl.toFixed(0)}` : 'No trades'} />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>{lbl}</div>
              {d && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                  {Math.round(d.wins / d.count * 100)}%
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Status badge colors ───────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  WORKING: 'badge-blue', PENDING_ACTIVATION: 'badge-blue',
  FILLED:  'badge-green', CANCELED: 'badge-amber', REJECTED: 'badge-red',
};

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { accountHash, positions, balances, orders, refreshOrders } = useApp();

  // Positions / Working Orders tab
  const [posTab,     setPosTab]     = useState<'positions' | 'working'>('positions');
  const [cancelling, setCancelling] = useState<number | null>(null);

  // Chart date filter (shared across Symbol / Setup / Time of Day)
  const [chartFilter,     setChartFilter]     = useState<DateFilter>('This Month');
  const [chartCustomFrom, setChartCustomFrom] = useState('');
  const [chartCustomTo,   setChartCustomTo]   = useState('');

  // Journal notes for setup tagging
  const [journalNotes, setJournalNotes] = useState<Record<string, { setup: string; notes: string }>>({});
  useEffect(() => {
    api.getJournalNotes().then(setJournalNotes).catch(() => {});
  }, []);

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

  const workingOrders = useMemo(() =>
    orders.filter(o => ['WORKING', 'PENDING_ACTIVATION'].includes(o.status)), [orders]);

  // Unrealized P&L (all positions — equity + options)
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

  // All paired closed trades (FIFO)
  const allTrades = useMemo(() => pairTrades(orders), [orders]);

  // Daily P&L (today's orders only)
  const dailyPnl = useMemo(() => {
    const todayOrders = orders.filter(o => {
      const t = o.enteredTime ?? o.closeTime;
      return t && new Date(t).toDateString() === todayStr;
    });
    return pairTrades(todayOrders).reduce((s, t) => s + t.pnl, 0);
  }, [orders, todayStr]);

  // YTD P&L = realized since Jan 1 + current open unrealized
  const realizedYtd = allTrades.filter(t => t.exitTime >= ytdStart).reduce((s, t) => s + t.pnl, 0);
  const ytdPnl      = realizedYtd + openPnl;

  // Chart-filtered trades
  const chartTrades = useMemo(() => {
    const [from, to] = getDateRange(chartFilter, chartCustomFrom, chartCustomTo);
    return allTrades.filter(t => t.exitTime >= from && t.exitTime <= to);
  }, [allTrades, chartFilter, chartCustomFrom, chartCustomTo]);

  const liquidation = balances?.liquidationValue ?? 0;
  const available   = balances?.cashAvailableForTrading ?? 0;

  const sodValue    = liquidation - dailyPnl;
  const dailyPnlPct = sodValue > 0 ? (dailyPnl / sodValue) * 100 : 0;
  const ytdPnlPct   = (liquidation - ytdPnl) > 0 ? (ytdPnl / (liquidation - ytdPnl)) * 100 : 0;

  const fmt$   = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });
  const fmtPnl = (n: number) => `${n >= 0 ? '+' : ''}$${n.toFixed(2)}`;
  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

  const pnlCards = [
    { label: 'Account Value',  value: `$${fmt$(liquidation)}`, color: 'var(--text-primary)',                              icon: <DollarSign size={13} /> },
    { label: 'Cash Available', value: `$${fmt$(available)}`,   color: 'var(--text-primary)',                              icon: <Zap size={13} /> },
    { label: 'Open P&L',       value: fmtPnl(openPnl),        color: openPnl     >= 0 ? 'var(--green)' : 'var(--red)',   icon: <TrendingUp size={13} /> },
    { label: 'Daily P&L',      value: fmtPnl(dailyPnl),       color: dailyPnl    >= 0 ? 'var(--green)' : 'var(--red)',   icon: <BarChart2 size={13} /> },
    { label: 'Daily P&L %',    value: fmtPct(dailyPnlPct),    color: dailyPnlPct >= 0 ? 'var(--green)' : 'var(--red)',   icon: <Percent size={13} /> },
    { label: 'YTD P&L',        value: fmtPnl(ytdPnl),         color: ytdPnl      >= 0 ? 'var(--green)' : 'var(--red)',   icon: <TrendingUp size={13} /> },
    { label: 'YTD P&L %',      value: fmtPct(ytdPnlPct),      color: ytdPnlPct   >= 0 ? 'var(--green)' : 'var(--red)',   icon: <Percent size={13} /> },
  ];

  const headerCards = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
      {pnlCards.map(({ label, value, color, icon }) => (
        <div key={label} style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '8px 14px',
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: 'var(--accent)' }}>{icon}</span>{label}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color }}>{value}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header title="Dashboard" subtitle="Account overview">{headerCards}</Header>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Positions / Working Orders (top) ───────────────────────────────── */}
        <div style={{ padding: 0, overflow: 'hidden', minHeight: 60, background: 'var(--bg-card)', border: '1px solid #3a3a5c', borderRadius: 10, position: 'relative', zIndex: 1 }}>
          {/* Tab header */}
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #3a3a5c' }}>
            <button onClick={() => setPosTab('positions')}
              style={{ padding: '13px 18px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                letterSpacing: '0.05em', background: 'transparent',
                color: posTab === 'positions' ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: posTab === 'positions' ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1, transition: 'all 0.15s' }}>
              POSITIONS ({positions.length})
            </button>
            <button onClick={() => setPosTab('working')}
              style={{ padding: '13px 18px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                letterSpacing: '0.05em', background: 'transparent',
                color: posTab === 'working' ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: posTab === 'working' ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1, transition: 'all 0.15s' }}>
              WORKING ORDERS ({workingOrders.length})
            </button>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, paddingRight: 16 }}>
              <div className="live-dot" /><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Live</span>
            </div>
          </div>

          {/* Positions tab — ALL positions (equity + options) */}
          {posTab === 'positions' && (
            positions.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No open positions</div>
            ) : (
              <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 320 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Symbol', 'Type', 'Qty', 'Avg Cost', 'Mark', 'P&L', 'P&L %'].map((h, i) => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: i === 0 ? 'left' : 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos: any, i: number) => {
                      const sym    = pos.instrument?.symbol ?? '';
                      const opt    = isOpt(sym);
                      const qty    = pos.longQuantity || pos.shortQuantity || 0;
                      const avg    = pos.averagePrice ?? 0;
                      const mktVal = pos.marketValue ?? 0;
                      const mult   = opt ? 100 : 1;
                      const pnl    = mktVal - avg * qty * mult;
                      const pct    = avg > 0 ? (pnl / (avg * qty * mult)) * 100 : 0;
                      const mark   = qty > 0 ? mktVal / (qty * mult) : 0;
                      const up     = pnl >= 0;
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <td style={{ padding: '11px 16px', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>
                            {opt ? formatSym(sym) : sym}
                          </td>
                          <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                            <span className={`badge ${opt ? 'badge-blue' : 'badge-amber'}`} style={{ fontSize: 10 }}>{opt ? 'OPT' : 'EQ'}</span>
                          </td>
                          <td style={{ padding: '11px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{qty}</td>
                          <td style={{ padding: '11px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>${avg.toFixed(2)}</td>
                          <td style={{ padding: '11px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>${mark.toFixed(2)}</td>
                          <td style={{ padding: '11px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: up ? 'var(--green)' : 'var(--red)' }}>
                            {up ? '+' : ''}${pnl.toFixed(2)}
                          </td>
                          <td style={{ padding: '11px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: up ? 'var(--green)' : 'var(--red)' }}>
                            {up ? '+' : ''}{pct.toFixed(2)}%
                          </td>
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
              <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 320 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Symbol', 'Side', 'Type', 'Qty', 'Filled', 'Price', 'Status', 'Time', ''].map((h, i) => (
                        <th key={i} style={{ padding: '10px 16px', textAlign: i === 0 ? 'left' : 'right', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
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
                          <td style={{ padding: '11px 16px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 13 }}>
                            {isOpt(sym) ? formatSym(sym) : sym}
                          </td>
                          <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: side.includes('BUY') ? 'var(--green)' : 'var(--red)' }}>{side}</span>
                          </td>
                          <td style={{ padding: '11px 16px', textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>{order.orderType}</td>
                          <td style={{ padding: '11px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{order.quantity}</td>
                          <td style={{ padding: '11px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{order.filledQuantity}</td>
                          <td style={{ padding: '11px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                            {order.price ? `$${Number(order.price).toFixed(2)}` : 'MKT'}
                          </td>
                          <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                            <span className={`badge ${STATUS_COLORS[order.status] ?? 'badge-amber'}`}>{order.status}</span>
                          </td>
                          <td style={{ padding: '11px 16px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {order.enteredTime ? new Date(order.enteredTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                          </td>
                          <td style={{ padding: '11px 16px', textAlign: 'right' }}>
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

        {/* ── Trading Calendar ───────────────────────────────────────────────── */}
        <CalendarWidget trades={allTrades} />

        {/* ── P&L Equity Curve ──────────────────────────────────────────────── */}
        <PnlLineGraph allTrades={allTrades} />

        {/* ── Analytics Charts (shared date filter) ─────────────────────────── */}
        <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', flexShrink: 0 }}>
            <Calendar size={13} style={{ display: 'inline', marginRight: 5 }} />CHARTS PERIOD
          </span>
          <DateFilterBar
            value={chartFilter} onChange={setChartFilter}
            customFrom={chartCustomFrom} customTo={chartCustomTo}
            onCustomFrom={setChartCustomFrom} onCustomTo={setChartCustomTo}
          />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {chartTrades.length} trades
          </span>
        </div>

        <PnlBySymbol    trades={chartTrades} />
        <PnlBySetup     trades={chartTrades} notes={journalNotes} />
        <PnlByTimeOfDay trades={chartTrades} />

        </div>
      </div>
    </div>
  );
}
