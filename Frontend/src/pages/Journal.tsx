import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, BarChart2, Calendar, List, Clock } from 'lucide-react';
import Header from '../components/Header';
import { api } from '../services/api';
import { useAccountHash } from '../hooks/useAccountHash';

const SETUPS = [
  'Opening Range FVG Breakout Bullish',
  'Opening Range FVG Breakout Bearish',
  'PDH Setup', 'PDL Setup',
  'PMH Setup', 'PML Setup',
  'Other',
];

function isOption(symbol: string) { return /^[A-Z]+\d{6}[CP]\d+$/.test(symbol); }

function formatOptionSymbol(symbol: string) {
  const m = symbol.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d+)$/);
  if (!m) return symbol;
  const [, underlying, y, mo, d, type, strike] = m;
  return `${underlying} $${parseInt(strike)/1000}${type} ${mo}/${d}/20${y}`;
}

function pairTrades(orders: any[]) {
  const filled = orders.filter(o => o.status === 'FILLED');
  const trades: any[] = [];
  const used = new Set<number>();
  filled.forEach((order, i) => {
    if (used.has(i)) return;
    const leg = order.orderLegCollection?.[0];
    if (!leg) return;
    const sym = leg.instrument?.symbol;
    if (!sym) return;
    const isBuy = (leg.instruction ?? '').includes('BUY');
    if (!isBuy) return;
    for (let j = i + 1; j < filled.length; j++) {
      if (used.has(j)) continue;
      const leg2 = filled[j].orderLegCollection?.[0];
      if (!leg2 || leg2.instrument?.symbol !== sym) continue;
      if (!(leg2.instruction ?? '').includes('SELL')) continue;
      const qty = order.quantity ?? 1;
      const entryPrice = order.price ?? order.averagePrice ?? 0;
      const exitPrice  = filled[j].price ?? filled[j].averagePrice ?? 0;
      const multiplier = isOption(sym) ? 100 : 1;
      const pnl = (exitPrice - entryPrice) * qty * multiplier;
      trades.push({
        id: `${i}-${j}`, symbol: sym, qty, entryPrice, exitPrice, pnl,
        entryTime: new Date(order.enteredTime ?? Date.now()),
        exitTime:  new Date(filled[j].enteredTime ?? Date.now()),
        win: pnl > 0, isOption: isOption(sym), setup: '', notes: '',
      });
      used.add(i); used.add(j); break;
    }
  });
  return trades;
}

function CalendarView({ trades }: { trades: any[] }) {
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
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <button onClick={() => setMonth(new Date(year, mon-1, 1))} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)' }}><ChevronLeft size={18}/></button>
        <span style={{ fontWeight:700, fontSize:15 }}>{month.toLocaleString('default',{month:'long',year:'numeric'})}</span>
        <button onClick={() => setMonth(new Date(year, mon+1, 1))} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)' }}><ChevronRight size={18}/></button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4, marginBottom:8 }}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} style={{ textAlign:'center', fontSize:10, fontWeight:600, color:'var(--text-muted)', padding:'4px 0' }}>{d}</div>)}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i}/>;
          const data = byDay[day]; const pos = data && data.pnl >= 0;
          return (
            <div key={day} style={{ minHeight:64, borderRadius:8, padding:'6px 8px', background: data ? (pos ? 'var(--green-bg)' : 'var(--red-bg)') : 'var(--bg-secondary)', border:`1px solid ${data ? (pos ? 'var(--green)' : 'var(--red)') : 'var(--border)'}` }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', marginBottom:4 }}>{day}</div>
              {data && <>
                <div style={{ fontSize:12, fontWeight:700, color: pos ? 'var(--green)' : 'var(--red)' }}>{pos?'+':''}{data.pnl.toFixed(0)}</div>
                <div style={{ fontSize:10, color:'var(--text-muted)' }}>{data.wins}/{data.count}</div>
              </>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnalyticsView({ trades }: { trades: any[] }) {
  if (!trades.length) return <div style={{ padding:40, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>No trade data</div>;
  const wins = trades.filter(t => t.win), losses = trades.filter(t => !t.win);
  const winRate = (wins.length / trades.length * 100).toFixed(1);
  const totalPnl = trades.reduce((s,t) => s+t.pnl, 0);
  const avgWin   = wins.length   ? wins.reduce((s,t)=>s+t.pnl,0)/wins.length : 0;
  const avgLoss  = losses.length ? losses.reduce((s,t)=>s+t.pnl,0)/losses.length : 0;
  const pf = losses.length && avgLoss !== 0 ? Math.abs(avgWin*wins.length/(avgLoss*losses.length)).toFixed(2) : '∞';
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
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:10 }}>
        {[
          {label:'Total P&L', value:`${totalPnl>=0?'+':''}$${totalPnl.toFixed(0)}`, color:totalPnl>=0?'var(--green)':'var(--red)'},
          {label:'Win Rate',  value:`${winRate}%`, color:parseFloat(winRate)>=50?'var(--green)':'var(--red)'},
          {label:'Trades',    value:trades.length,  color:'var(--text-primary)'},
          {label:'Avg Win',   value:`$${avgWin.toFixed(0)}`,  color:'var(--green)'},
          {label:'Avg Loss',  value:`$${avgLoss.toFixed(0)}`, color:'var(--red)'},
          {label:'Prof. Factor', value:pf, color:parseFloat(pf)>=1.5?'var(--green)':'var(--amber)'},
        ].map(({label,value,color}) => (
          <div key={label} className="card" style={{padding:'12px 14px'}}>
            <div style={{fontSize:9,color:'var(--text-muted)',fontWeight:600,letterSpacing:'0.05em',marginBottom:6}}>{label}</div>
            <div style={{fontSize:18,fontWeight:700,color,fontFamily:'JetBrains Mono,monospace'}}>{value}</div>
          </div>
        ))}
      </div>
      <div className="card" style={{padding:20}}>
        <div style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',marginBottom:14,display:'flex',alignItems:'center',gap:6}}><Clock size={13}/> TIME OF DAY</div>
        <div style={{display:'flex',gap:3,alignItems:'flex-end',height:80}}>
          {Array.from({length:13},(_,i)=>i+9).map(h => {
            const d = hourStats[h]; const pnl = d?.pnl??0;
            const ht = d ? Math.max(8, Math.abs(pnl)/maxPnl*72) : 8;
            const col = pnl>0?'var(--green)':pnl<0?'var(--red)':'var(--border)';
            return (
              <div key={h} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                <div style={{fontSize:8,color:col,fontFamily:'JetBrains Mono,monospace',fontWeight:600}}>{d?`${pnl>=0?'+':''}${pnl.toFixed(0)}`:''}</div>
                <div style={{width:'100%',height:ht,background:col,borderRadius:2,minHeight:8}}/>
                <div style={{fontSize:8,color:'var(--text-muted)'}}>{h>12?`${h-12}p`:h===12?'12p':`${h}a`}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="card" style={{padding:20}}>
        <div style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',marginBottom:14,display:'flex',alignItems:'center',gap:6}}><BarChart2 size={13}/> SETUP BREAKDOWN</div>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
            {['Setup','Trades','Win%','P&L','Avg'].map(h=><th key={h} style={{padding:'5px 8px',textAlign:h==='Setup'?'left':'right',fontSize:10,color:'var(--text-muted)',fontWeight:600}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {Object.entries(setupStats).sort((a,b)=>b[1].pnl-a[1].pnl).map(([s,st])=>{
              const wr = (st.wins/st.count*100).toFixed(0);
              const avg = (st.pnl/st.count).toFixed(0);
              return <tr key={s} style={{borderBottom:'1px solid var(--border)'}}
                onMouseEnter={e=>(e.currentTarget.style.background='var(--bg-hover)')}
                onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                <td style={{padding:'7px 8px',fontWeight:500}}>{s}</td>
                <td style={{padding:'7px 8px',textAlign:'right',fontFamily:'JetBrains Mono,monospace'}}>{st.count}</td>
                <td style={{padding:'7px 8px',textAlign:'right',color:parseInt(wr)>=50?'var(--green)':'var(--red)',fontFamily:'JetBrains Mono,monospace'}}>{wr}%</td>
                <td style={{padding:'7px 8px',textAlign:'right',color:st.pnl>=0?'var(--green)':'var(--red)',fontFamily:'JetBrains Mono,monospace'}}>{st.pnl>=0?'+':''}${st.pnl.toFixed(0)}</td>
                <td style={{padding:'7px 8px',textAlign:'right',color:parseFloat(avg)>=0?'var(--green)':'var(--red)',fontFamily:'JetBrains Mono,monospace'}}>{parseFloat(avg)>=0?'+':''}${avg}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Journal() {
  const { accountHash }       = useAccountHash();
  const [orders, setOrders]   = useState<any[]>([]);
  const [trades, setTrades]   = useState<any[]>([]);
  const [view, setView]       = useState<'list'|'calendar'|'analytics'>('list');
  const [editId, setEditId]   = useState<string|null>(null);
  const [editSetup, setEditSetup] = useState('');
  const [editOther, setEditOther] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saved, setSaved]     = useState<Record<string,{setup:string;notes:string}>>(() => {
    try { return JSON.parse(localStorage.getItem('alphaDesk_journal')?? '{}'); } catch { return {}; }
  });

  useEffect(() => {
    if (!accountHash) return;
    api.getOrders(accountHash).then(d => setOrders(Array.isArray(d)?d:[])).catch(()=>{});
  }, [accountHash]);

  useEffect(() => {
    setTrades(pairTrades(orders).map(t => ({ ...t, setup: saved[t.id]?.setup??'', notes: saved[t.id]?.notes??'' })));
  }, [orders, saved]);

  const startEdit = (t: any) => {
    setEditId(t.id);
    const knownSetup = SETUPS.includes(t.setup) ? t.setup : (t.setup ? 'Other' : '');
    setEditSetup(knownSetup);
    setEditOther(knownSetup === 'Other' ? t.setup : '');
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

  const totalPnl = trades.reduce((s,t)=>s+t.pnl,0);
  const winCount = trades.filter(t=>t.win).length;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>
      <Header title="Journal" subtitle="Trade history & analytics" />
      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', padding:16, gap:12 }}>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
          {([
            {key:'list',      label:'Trades',    icon:<List size={12}/>},
            {key:'calendar',  label:'Calendar',  icon:<Calendar size={12}/>},
            {key:'analytics', label:'Analytics', icon:<BarChart2 size={12}/>},
          ] as const).map(({key,label,icon}) => (
            <button key={key} onClick={()=>setView(key)}
              style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
                background:view===key?'var(--accent)':'var(--bg-secondary)', color:view===key?'white':'var(--text-muted)' }}>
              {icon}{label}
            </button>
          ))}
          <div style={{ marginLeft:'auto', fontSize:11, color:'var(--text-muted)' }}>
            {trades.length} trades · {winCount}W {trades.length-winCount}L · <span style={{color:totalPnl>=0?'var(--green)':'var(--red)',fontWeight:600}}>{totalPnl>=0?'+':''}${totalPnl.toFixed(0)}</span>
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto' }}>
          {view==='calendar'  && <CalendarView  trades={trades}/>}
          {view==='analytics' && <AnalyticsView trades={trades}/>}
          {view==='list' && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {trades.length===0
                ? <div style={{padding:60,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>No closed trades found</div>
                : trades.map(trade => (
                  <div key={trade.id} className="card" style={{padding:16}}>
                    <div style={{display:'flex',alignItems:'flex-start',gap:16,flexWrap:'wrap'}}>
                      <div style={{minWidth:140}}>
                        <div style={{fontFamily:'JetBrains Mono,monospace',fontWeight:700,fontSize:13}}>
                          {trade.isOption ? formatOptionSymbol(trade.symbol) : trade.symbol}
                        </div>
                        <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>
                          {trade.entryTime.toLocaleDateString()} {trade.entryTime.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                        </div>
                      </div>
                      <div style={{display:'flex',gap:16,fontSize:12,fontFamily:'JetBrains Mono,monospace'}}>
                        {[['ENTRY',`$${trade.entryPrice.toFixed(2)}`],['EXIT',`$${trade.exitPrice.toFixed(2)}`],['QTY',`${trade.qty}${trade.isOption?'x':''}`]].map(([l,v])=>(
                          <div key={l}><div style={{fontSize:9,color:'var(--text-muted)',marginBottom:2}}>{l}</div><div>{v}</div></div>
                        ))}
                      </div>
                      <div style={{marginLeft:'auto',textAlign:'right'}}>
                        <div style={{fontSize:18,fontWeight:700,fontFamily:'JetBrains Mono,monospace',color:trade.pnl>=0?'var(--green)':'var(--red)'}}>
                          {trade.pnl>=0?'+':''}${trade.pnl.toFixed(2)}
                        </div>
                        <span className={`badge ${trade.win?'badge-green':'badge-red'}`} style={{marginTop:4}}>{trade.win?'WIN':'LOSS'}</span>
                      </div>
                    </div>
                    {editId===trade.id ? (
                      <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:10}}>
                        <div>
                          <label style={{fontSize:10,fontWeight:600,color:'var(--text-muted)',display:'block',marginBottom:4}}>SETUP</label>
                          <select value={editSetup} onChange={e=>setEditSetup(e.target.value)} style={{width:'100%',fontSize:12}}>
                            <option value="">— Select setup —</option>
                            {SETUPS.map(s=><option key={s} value={s}>{s}</option>)}
                          </select>
                          {editSetup==='Other' && <input value={editOther} onChange={e=>setEditOther(e.target.value)} placeholder="Describe setup..." style={{width:'100%',marginTop:6,fontSize:12}}/>}
                        </div>
                        <div>
                          <label style={{fontSize:10,fontWeight:600,color:'var(--text-muted)',display:'block',marginBottom:4}}>NOTES</label>
                          <textarea value={editNotes} onChange={e=>setEditNotes(e.target.value)} placeholder="Notes, observations..." rows={3}
                            style={{width:'100%',fontSize:12,resize:'vertical',fontFamily:'inherit'}}/>
                        </div>
                        <div style={{display:'flex',gap:8}}>
                          <button onClick={saveEdit} style={{padding:'7px 16px',borderRadius:8,border:'none',cursor:'pointer',fontWeight:600,fontSize:12,background:'var(--accent)',color:'white'}}>Save</button>
                          <button onClick={()=>setEditId(null)} style={{padding:'7px 16px',borderRadius:8,border:'1px solid var(--border)',cursor:'pointer',fontSize:12,background:'transparent',color:'var(--text-muted)'}}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
                        {trade.setup ? <span className="badge badge-blue">{trade.setup}</span> : <span style={{fontSize:11,color:'var(--text-muted)'}}>No setup tagged</span>}
                        {trade.notes && <span style={{fontSize:12,color:'var(--text-secondary)',flex:1}}>{trade.notes}</span>}
                        <button onClick={()=>startEdit(trade)} style={{marginLeft:'auto',padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',background:'transparent',cursor:'pointer',fontSize:11,color:'var(--text-muted)'}}>Edit</button>
                      </div>
                    )}
                  </div>
                ))
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
