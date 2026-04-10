import { useState, useEffect, useMemo } from 'react';
import { BarChart2, List, Clock } from 'lucide-react';
import Header from '../components/Header';
import { useApp } from '../context/AppContext';

const SETUPS = [
  'Opening Range FVG Breakout Bullish',
  'Opening Range FVG Breakout Bearish',
  'PDH Setup', 'PDL Setup',
  'PMH Setup', 'PML Setup',
  'Other',
];

const DATE_FILTERS = ['Today', 'Yesterday', 'This Week', 'This Month', 'This Year', 'Custom'] as const;
type DateFilter = typeof DATE_FILTERS[number];

function isOption(sym: string) { return /^[A-Z]+\s*\d{6}[CP]\d+$/.test(sym.trim()); }

function formatSym(sym: string) {
  const m = sym.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d+)$/);
  if (!m) return sym;
  const [, u, y, mo, d, type, strike] = m;
  return `${u} $${parseInt(strike)/1000}${type} ${mo}/${d}/20${y}`;
}

function getDateRange(filter: DateFilter, customFrom: string, customTo: string): [Date, Date] {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end   = new Date(today.getTime() + 86400000 - 1);
  switch (filter) {
    case 'Today':     return [today, end];
    case 'Yesterday': {
      const y = new Date(today.getTime() - 86400000);
      return [y, new Date(today.getTime() - 1)];
    }
    case 'This Week': {
      const day = today.getDay();
      const mon = new Date(today.getTime() - day * 86400000);
      return [mon, end];
    }
    case 'This Month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return [first, end];
    }
    case 'This Year': {
      const first = new Date(now.getFullYear(), 0, 1);
      return [first, end];
    }
    case 'Custom': {
      const from = customFrom ? new Date(customFrom) : today;
      const to   = customTo   ? new Date(new Date(customTo).getTime() + 86400000 - 1) : end;
      return [from, to];
    }
  }
}

// FIFO trade pairing — only returns trades with both entry AND confirmed exit
function pairTrades(orders: any[]): any[] {
  const filled = orders
    .filter(o => o.status === 'FILLED' && o.orderLegCollection?.[0])
    .sort((a, b) => new Date(a.enteredTime ?? 0).getTime() - new Date(b.enteredTime ?? 0).getTime());

  // Group by symbol
  const bySymbol: Record<string, any[]> = {};
  filled.forEach(o => {
    const sym = o.orderLegCollection[0].instrument?.symbol ?? '';
    if (!sym) return;
    if (!bySymbol[sym]) bySymbol[sym] = [];
    bySymbol[sym].push(o);
  });

  const trades: any[] = [];

  Object.entries(bySymbol).forEach(([sym, orders]) => {
    const opt  = isOption(sym.trim());
    const buyQueue: any[] = [];

    orders.forEach(order => {
      const leg         = order.orderLegCollection[0];
      const instruction = (leg.instruction ?? '').toUpperCase();
      // Strict matching — only exact entry/exit instructions
      const isEntry = instruction === 'BUY' || instruction === 'BUY_TO_OPEN';
      const isExit  = instruction === 'SELL' || instruction === 'SELL_TO_CLOSE' || instruction === 'SELL_SHORT';

      if (isEntry) {
        buyQueue.push(order);
      } else if (isExit && buyQueue.length > 0) {
        const entry     = buyQueue.shift();
        const qty       = Math.min(entry.filledQuantity ?? entry.quantity ?? 1, order.filledQuantity ?? order.quantity ?? 1);
        // Use fill price from execution legs if available (more accurate for options)
        const getPrice = (o: any) => {
          const execPrice = o.orderActivityCollection?.[0]?.executionLegs?.[0]?.price;
          return execPrice ?? o.price ?? o.averagePrice ?? 0;
        };
        const entryPrice = getPrice(entry);
        const exitPrice  = getPrice(order);
        const multiplier = opt ? 100 : 1;
        const pnl        = (exitPrice - entryPrice) * qty * multiplier;

        trades.push({
          id:         `${entry.orderId}-${order.orderId}`,
          symbol:     sym,
          qty,
          entryPrice,
          exitPrice,
          pnl,
          entryTime:  new Date(entry.enteredTime ?? entry.closeTime ?? Date.now()),
          exitTime:   new Date(order.enteredTime ?? order.closeTime ?? Date.now()),
          win:        pnl > 0,
          isOption:   opt,
          setup:      '',
          notes:      '',
        });
      }
    });
    // orphaned entries (no exit) are discarded — not added to trades
  });

  return trades.sort((a, b) => b.entryTime.getTime() - a.entryTime.getTime());
}

function AnalyticsView({ trades }: { trades: any[] }) {
  if (!trades.length) return <div style={{ padding:60, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>No completed trades in selected range</div>;

  const wins     = trades.filter(t => t.win);
  const losses   = trades.filter(t => !t.win);
  const winRate  = (wins.length / trades.length * 100).toFixed(1);
  const totalPnl = trades.reduce((s,t) => s+t.pnl, 0);
  const avgWin   = wins.length   ? wins.reduce((s,t)=>s+t.pnl,0)/wins.length   : 0;
  const avgLoss  = losses.length ? losses.reduce((s,t)=>s+t.pnl,0)/losses.length : 0;
  const pf       = losses.length && avgLoss !== 0 ? Math.abs(avgWin*wins.length/(avgLoss*losses.length)).toFixed(2) : '∞';

  const setupStats: Record<string,{count:number;wins:number;pnl:number}> = {};
  trades.forEach(t => {
    const s = t.setup || 'Untagged';
    if (!setupStats[s]) setupStats[s] = {count:0,wins:0,pnl:0};
    setupStats[s].count++; setupStats[s].wins += t.win?1:0; setupStats[s].pnl += t.pnl;
  });

  const hourStats: Record<number,{count:number;wins:number;pnl:number}> = {};
  trades.forEach(t => {
    const h = t.entryTime.getHours();
    if (!hourStats[h]) hourStats[h] = {count:0,wins:0,pnl:0};
    hourStats[h].count++; hourStats[h].wins += t.win?1:0; hourStats[h].pnl += t.pnl;
  });
  const maxPnl = Math.max(...Object.values(hourStats).map(h=>Math.abs(h.pnl)), 1);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:10 }}>
        {[
          {label:'Total P&L',    value:`${totalPnl>=0?'+':''}$${totalPnl.toFixed(0)}`,  color:totalPnl>=0?'var(--green)':'var(--red)'},
          {label:'Win Rate',     value:`${winRate}%`,   color:parseFloat(winRate)>=50?'var(--green)':'var(--red)'},
          {label:'Total Trades', value:String(trades.length), color:'var(--text-primary)'},
          {label:'Avg Win',      value:`$${avgWin.toFixed(0)}`,   color:'var(--green)'},
          {label:'Avg Loss',     value:`$${avgLoss.toFixed(0)}`,  color:'var(--red)'},
          {label:'Prof Factor',  value:String(pf), color:parseFloat(pf)>=1.5?'var(--green)':'var(--amber)'},
        ].map(({label,value,color}) => (
          <div key={label} className="card" style={{padding:'12px 14px'}}>
            <div style={{fontSize:9,color:'var(--text-muted)',fontWeight:600,letterSpacing:'0.05em',marginBottom:6,textTransform:'uppercase'}}>{label}</div>
            <div style={{fontSize:18,fontWeight:700,color,fontFamily:'JetBrains Mono,monospace'}}>{value}</div>
          </div>
        ))}
      </div>

      {/* Time of day */}
      <div className="card" style={{padding:20}}>
        <div style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',marginBottom:14,display:'flex',alignItems:'center',gap:6,letterSpacing:'0.05em'}}>
          <Clock size={13}/> TIME OF DAY PERFORMANCE
        </div>
        <div style={{display:'flex',gap:3,alignItems:'flex-end',height:90}}>
          {Array.from({length:13},(_,i)=>i+9).map(h => {
            const d = hourStats[h]; const pnl = d?.pnl??0;
            const ht = d ? Math.max(8,Math.abs(pnl)/maxPnl*76) : 8;
            const col = pnl>0?'var(--green)':pnl<0?'var(--red)':'var(--border)';
            return (
              <div key={h} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                <div style={{fontSize:8,color:col,fontFamily:'JetBrains Mono,monospace',fontWeight:600,textAlign:'center'}}>
                  {d?`${pnl>=0?'+':''}${pnl.toFixed(0)}`:''}
                </div>
                <div style={{width:'100%',height:ht,background:col,borderRadius:3,minHeight:8}}
                  title={d?`${d.wins}W ${d.count-d.wins}L | $${pnl.toFixed(0)}`:'No trades'}/>
                <div style={{fontSize:8,color:'var(--text-muted)',textAlign:'center'}}>{h>12?`${h-12}p`:h===12?'12p':`${h}a`}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Setup breakdown */}
      <div className="card" style={{padding:20}}>
        <div style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',marginBottom:14,display:'flex',alignItems:'center',gap:6,letterSpacing:'0.05em'}}>
          <BarChart2 size={13}/> SETUP BREAKDOWN
        </div>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead>
            <tr style={{borderBottom:'1px solid var(--border)'}}>
              {['Setup','Trades','Win%','Total P&L','Avg P&L'].map(h =>
                <th key={h} style={{padding:'5px 8px',textAlign:h==='Setup'?'left':'right',fontSize:10,color:'var(--text-muted)',fontWeight:600,letterSpacing:'0.04em'}}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {Object.entries(setupStats).sort((a,b)=>b[1].pnl-a[1].pnl).map(([s,st]) => {
              const wr  = (st.wins/st.count*100).toFixed(0);
              const avg = (st.pnl/st.count).toFixed(0);
              return (
                <tr key={s} style={{borderBottom:'1px solid var(--border)'}}
                  onMouseEnter={e=>(e.currentTarget.style.background='var(--bg-hover)')}
                  onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                  <td style={{padding:'7px 8px',fontWeight:500,fontSize:12}}>{s}</td>
                  <td style={{padding:'7px 8px',textAlign:'right',fontFamily:'JetBrains Mono,monospace'}}>{st.count}</td>
                  <td style={{padding:'7px 8px',textAlign:'right',color:parseInt(wr)>=50?'var(--green)':'var(--red)',fontFamily:'JetBrains Mono,monospace'}}>{wr}%</td>
                  <td style={{padding:'7px 8px',textAlign:'right',color:st.pnl>=0?'var(--green)':'var(--red)',fontFamily:'JetBrains Mono,monospace',fontWeight:600}}>{st.pnl>=0?'+':''}${st.pnl.toFixed(0)}</td>
                  <td style={{padding:'7px 8px',textAlign:'right',color:parseFloat(avg)>=0?'var(--green)':'var(--red)',fontFamily:'JetBrains Mono,monospace'}}>{parseFloat(avg)>=0?'+':''}${avg}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Journal() {
  const { orders } = useApp();
  const [view, setView]           = useState<'list'|'analytics'>('list');
  const [dateFilter, setDateFilter] = useState<DateFilter>('This Month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');
  const [editId,     setEditId]     = useState<string|null>(null);
  const [editSetup,  setEditSetup]  = useState('');
  const [editOther,  setEditOther]  = useState('');
  const [editNotes,  setEditNotes]  = useState('');
  const [saved, setSaved] = useState<Record<string,{setup:string;notes:string}>>(() => {
    try { return JSON.parse(localStorage.getItem('alphaDesk_journal')?? '{}'); } catch { return {}; }
  });

  // Pair trades and apply saved metadata
  const allTrades = useMemo(() =>
    pairTrades(orders).map(t => ({
      ...t,
      setup: saved[t.id]?.setup ?? '',
      notes: saved[t.id]?.notes ?? '',
    })),
    [orders, saved]
  );

  // Apply date filter
  const trades = useMemo(() => {
    const [from, to] = getDateRange(dateFilter, customFrom, customTo);
    return allTrades.filter(t => t.entryTime >= from && t.entryTime <= to);
  }, [allTrades, dateFilter, customFrom, customTo]);

  const totalPnl = trades.reduce((s,t) => s+t.pnl, 0);
  const winCount = trades.filter(t => t.win).length;

  const startEdit = (t: any) => {
    setEditId(t.id);
    const known = SETUPS.includes(t.setup) ? t.setup : (t.setup ? 'Other' : '');
    setEditSetup(known);
    setEditOther(known === 'Other' ? t.setup : '');
    setEditNotes(t.notes || '');
  };

  const saveEdit = () => {
    if (!editId) return;
    const finalSetup = editSetup === 'Other' ? editOther : editSetup;
    const updated = { ...saved, [editId]: { setup: finalSetup, notes: editNotes } };
    setSaved(updated);
    localStorage.setItem('alphaDesk_journal', JSON.stringify(updated));
    setEditId(null);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>
      <Header title="Journal" subtitle="Trade history & analytics" />

      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', padding:16, gap:10 }}>

        {/* Date filter bar */}
        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0, flexWrap:'wrap' }}>
          <div style={{ display:'flex', background:'var(--bg-secondary)', borderRadius:8, padding:3, gap:2 }}>
            {DATE_FILTERS.map(f => (
              <button key={f} onClick={() => setDateFilter(f)}
                style={{ padding:'5px 10px', borderRadius:6, border:'none', cursor:'pointer', fontSize:11, fontWeight:600,
                  background: dateFilter===f ? 'var(--accent)' : 'transparent',
                  color:      dateFilter===f ? 'white'         : 'var(--text-muted)' }}>
                {f}
              </button>
            ))}
          </div>
          {dateFilter === 'Custom' && (
            <>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                style={{ fontSize:11, padding:'5px 8px' }} />
              <span style={{ fontSize:11, color:'var(--text-muted)' }}>to</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                style={{ fontSize:11, padding:'5px 8px' }} />
            </>
          )}
          <div style={{ marginLeft:'auto', fontSize:11, color:'var(--text-muted)' }}>
            {trades.length} trades · {winCount}W {trades.length-winCount}L ·{' '}
            <span style={{ color:totalPnl>=0?'var(--green)':'var(--red)', fontWeight:700, fontFamily:'JetBrains Mono,monospace' }}>
              {totalPnl>=0?'+':''}${totalPnl.toFixed(0)}
            </span>
          </div>
        </div>

        {/* View tabs */}
        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
          {([
            {key:'list',      label:'Trades',    icon:<List size={12}/>},
            {key:'analytics', label:'Analytics', icon:<BarChart2 size={12}/>},
          ] as const).map(({key,label,icon}) => (
            <button key={key} onClick={()=>setView(key)}
              style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 14px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
                background:view===key?'var(--accent)':'var(--bg-secondary)',
                color:view===key?'white':'var(--text-muted)' }}>
              {icon}{label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {view==='analytics' && <AnalyticsView trades={trades}/>}

          {view==='list' && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {trades.length===0 ? (
                <div style={{padding:60,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>
                  No completed trades in selected period
                </div>
              ) : trades.map(trade => (
                <div key={trade.id} className="card" style={{padding:16}}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:16,flexWrap:'wrap'}}>
                    {/* Symbol */}
                    <div style={{minWidth:150}}>
                      <div style={{fontFamily:'JetBrains Mono,monospace',fontWeight:700,fontSize:13}}>
                        {trade.isOption ? formatSym(trade.symbol) : trade.symbol}
                      </div>
                      <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>
                        {trade.entryTime.toLocaleDateString()} · {trade.entryTime.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                      </div>
                    </div>

                    {/* Prices */}
                    <div style={{display:'flex',gap:16,fontSize:12,fontFamily:'JetBrains Mono,monospace'}}>
                      {[['ENTRY',`$${trade.entryPrice.toFixed(2)}`],['EXIT',`$${trade.exitPrice.toFixed(2)}`],['QTY',`${trade.qty}${trade.isOption?'x':''}`]].map(([l,v])=>(
                        <div key={l}>
                          <div style={{fontSize:9,color:'var(--text-muted)',marginBottom:3,letterSpacing:'0.05em'}}>{l}</div>
                          <div>{v}</div>
                        </div>
                      ))}
                    </div>

                    {/* P&L */}
                    <div style={{marginLeft:'auto',textAlign:'right'}}>
                      <div style={{fontSize:20,fontWeight:700,fontFamily:'JetBrains Mono,monospace',color:trade.pnl>=0?'var(--green)':'var(--red)'}}>
                        {trade.pnl>=0?'+':''}${trade.pnl.toFixed(2)}
                      </div>
                      <span className={`badge ${trade.win?'badge-green':'badge-red'}`} style={{marginTop:4,display:'inline-block'}}>
                        {trade.win?'WIN':'LOSS'}
                      </span>
                    </div>
                  </div>

                  {/* Setup & Notes */}
                  {editId===trade.id ? (
                    <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:10}}>
                      <div>
                        <label style={{fontSize:10,fontWeight:600,color:'var(--text-muted)',display:'block',marginBottom:5,letterSpacing:'0.05em'}}>SETUP</label>
                        <select value={editSetup} onChange={e=>setEditSetup(e.target.value)} style={{width:'100%',fontSize:12,background:'var(--bg-secondary)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:6,padding:'6px 8px'}}>
                          <option value="">— Select setup —</option>
                          {SETUPS.map(s=><option key={s} value={s}>{s}</option>)}
                        </select>
                        {editSetup==='Other' && (
                          <input value={editOther} onChange={e=>setEditOther(e.target.value)}
                            placeholder="Describe your setup..." style={{width:'100%',marginTop:6,fontSize:12,background:'var(--bg-secondary)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:6,padding:'6px 8px'}}/>
                        )}
                      </div>
                      <div>
                        <label style={{fontSize:10,fontWeight:600,color:'var(--text-muted)',display:'block',marginBottom:5,letterSpacing:'0.05em'}}>NOTES</label>
                        <textarea value={editNotes} onChange={e=>setEditNotes(e.target.value)}
                          placeholder="Trade notes, observations, what you did well/poorly..." rows={3}
                          style={{width:'100%',fontSize:12,resize:'vertical',fontFamily:'inherit',background:'var(--bg-secondary)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:6,padding:'6px 8px'}}/>
                      </div>
                      <div style={{display:'flex',gap:8}}>
                        <button onClick={saveEdit} style={{padding:'7px 20px',borderRadius:8,border:'none',cursor:'pointer',fontWeight:600,fontSize:12,background:'var(--accent)',color:'white'}}>Save</button>
                        <button onClick={()=>setEditId(null)} style={{padding:'7px 16px',borderRadius:8,border:'1px solid var(--border)',cursor:'pointer',fontSize:12,background:'transparent',color:'var(--text-muted)'}}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                      {trade.setup
                        ? <span className="badge badge-blue">{trade.setup}</span>
                        : <span style={{fontSize:11,color:'var(--text-muted)'}}>No setup tagged</span>}
                      {trade.notes && <span style={{fontSize:12,color:'var(--text-secondary)',flex:1}}>{trade.notes}</span>}
                      <button onClick={()=>startEdit(trade)}
                        style={{marginLeft:'auto',padding:'4px 12px',borderRadius:6,border:'1px solid var(--border)',background:'transparent',cursor:'pointer',fontSize:11,color:'var(--text-muted)'}}>
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
