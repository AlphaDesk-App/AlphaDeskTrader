import { useState, useEffect, useRef, useCallback } from 'react';
import Header from '../components/Header';
import { api } from '../services/api';
import { useAccountHash } from '../hooks/useAccountHash';
import { useLiveOrders } from '../hooks/useLiveOrders';
import { useColumnWidths, useRowHeight } from '../hooks/useResizable';

function isOption(symbol: string) { return /^[A-Z]+\d{6}[CP]\d+$/.test(symbol); }

function formatSym(symbol: string) {
  const m = symbol.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d+)$/);
  if (!m) return symbol;
  const [, u, y, mo, d, type, strike] = m;
  return `${u} $${parseInt(strike)/1000}${type} ${mo}/${d}/20${y}`;
}

const POS_COLS    = ['Symbol','Qty','Avg Price','Mark','P&L','P&L %','Value'];
const POS_WIDTHS  = [160, 60, 90, 90, 90, 70, 90];

interface ContextMenu { x: number; y: number; position: any; }

export default function Positions() {
  const { accountHash }               = useAccountHash();
  const { orders }                    = useLiveOrders(accountHash);
  const [portfolio, setPortfolio]     = useState<any>(null);
  const [activeTab, setActiveTab]     = useState<'open'|'working'|'filled'|'rejected'>('open');
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [limitPrice, setLimitPrice]   = useState('');
  const [flattenMode, setFlattenMode] = useState<'market'|'limit'|null>(null);
  const [flattenPos, setFlattenPos]   = useState<any>(null);
  const [orderMsg, setOrderMsg]       = useState('');
  const contextRef                    = useRef<HTMLDivElement>(null);
  const { widths, startResize }       = useColumnWidths('positions_table', POS_WIDTHS);
  const { rowHeight, startRowResize } = useRowHeight('positions_table');

  const fetchPortfolio = useCallback(() => {
    if (!accountHash) return;
    api.getPortfolio(accountHash).then(setPortfolio).catch(() => {});
  }, [accountHash]);

  useEffect(() => { fetchPortfolio(); const i = setInterval(fetchPortfolio, 5000); return () => clearInterval(i); }, [fetchPortfolio]);

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setContextMenu(null); setFlattenMode(null);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, []);

  const onRightClick = (e: React.MouseEvent, pos: any) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, position: pos });
    setFlattenMode(null); setLimitPrice(''); setOrderMsg('');
  };

  const flatten = async (mode: 'market' | 'limit') => {
    const pos = contextMenu?.position;
    if (!pos) return;
    setFlattenPos(pos);
    const sym       = pos.instrument?.symbol ?? pos.symbol;
    const qty       = Math.abs(pos.longQuantity ?? pos.shortQuantity ?? pos.quantity ?? 1);
    const isLong    = (pos.longQuantity ?? 0) > 0;
    const isOpt     = isOption(sym);
    const instruction = isLong
      ? (isOpt ? 'SELL_TO_CLOSE' : 'SELL')
      : (isOpt ? 'BUY_TO_CLOSE'  : 'BUY');

    const order: any = {
      orderType: mode === 'market' ? 'MARKET' : 'LIMIT',
      session: 'NORMAL', duration: 'DAY', orderStrategyType: 'SINGLE',
      ...(mode === 'limit' && limitPrice ? { price: parseFloat(limitPrice) } : {}),
      orderLegCollection: [{ instruction, quantity: qty, instrument: { symbol: sym, assetType: isOpt ? 'OPTION' : 'EQUITY' } }],
    };

    try {
      await api.placeOrder(accountHash, order);
      setOrderMsg(`✓ Flatten order placed`);
      setContextMenu(null); setFlattenMode(null);
      setTimeout(() => setOrderMsg(''), 3000);
      setTimeout(fetchPortfolio, 1000);
    } catch (e: any) {
      setOrderMsg(`✗ ${e.message}`);
    }
  };

  const positions = portfolio?.securitiesAccount?.positions ?? [];
  const filteredOrders = (status: string) => orders.filter((o: any) => o.status === status);

  const COL_LABELS_ORDERS = ['Symbol','Side','Type','Qty','Filled','Price','Status','Time'];
  const ORDER_WIDTHS       = [140, 60, 80, 50, 55, 70, 110, 100];
  const { widths: oWidths, startResize: oResize } = useColumnWidths('orders_pos_table', ORDER_WIDTHS);
  const { rowHeight: oRowH, startRowResize: oRowResize } = useRowHeight('orders_pos_table');

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>
      <Header title="Positions" subtitle="Live positions & orders" />

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--border)', background:'var(--bg-secondary)', flexShrink:0 }}>
        {(['open','working','filled','rejected'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding:'10px 20px', border:'none', cursor:'pointer', fontSize:12, fontWeight:600, background:'transparent',
              color: activeTab===tab ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: activeTab===tab ? '2px solid var(--accent)' : '2px solid transparent', textTransform:'capitalize' }}>
            {tab === 'open' ? 'Open Positions' : `${tab.charAt(0).toUpperCase()+tab.slice(1)} Orders`}
          </button>
        ))}
      </div>

      {orderMsg && (
        <div style={{ padding:'8px 16px', background: orderMsg.startsWith('✓') ? 'var(--green-bg)' : 'var(--red-bg)', fontSize:12, color: orderMsg.startsWith('✓') ? 'var(--green)' : 'var(--red)', flexShrink:0 }}>
          {orderMsg}
        </div>
      )}

      <div style={{ flex:1, overflow:'auto', padding:16 }}>
        {activeTab === 'open' && (
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', fontSize:11, fontWeight:600, color:'var(--text-muted)', letterSpacing:'0.05em' }}>
              OPEN POSITIONS ({positions.length}) — Right-click to flatten
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ borderCollapse:'collapse', tableLayout:'fixed', width: widths.reduce((a,b)=>a+b,0)+'px' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)' }}>
                    {POS_COLS.map((h,i) => (
                      <th key={i} style={{ width:widths[i], padding:'8px 12px', textAlign:i===0?'left':'right', fontSize:10, fontWeight:600, color:'var(--text-muted)', letterSpacing:'0.05em', position:'relative', userSelect:'none', overflow:'hidden', whiteSpace:'nowrap' }}>
                        {h}
                        <div onMouseDown={e=>startResize(i,e)} style={{ position:'absolute', right:0, top:0, bottom:0, width:6, cursor:'col-resize', display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <div style={{ width:2, height:14, background:'var(--border-strong)', borderRadius:1, opacity:0.5 }}/>
                        </div>
                      </th>
                    ))}
                    <th style={{ width:16, padding:0, position:'relative' }}>
                      <div onMouseDown={startRowResize} style={{ position:'absolute', bottom:0, left:0, right:0, height:6, cursor:'row-resize', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <div style={{ width:14, height:2, background:'var(--border-strong)', borderRadius:1, opacity:0.5 }}/>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {positions.length === 0
                    ? <tr><td colSpan={POS_COLS.length+1} style={{ padding:40, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>No open positions</td></tr>
                    : positions.map((pos: any, i: number) => {
                      const sym       = pos.instrument?.symbol ?? '—';
                      const qty       = pos.longQuantity || pos.shortQuantity || 0;
                      const avg       = pos.averagePrice ?? 0;
                      const mark      = pos.marketValue  ? pos.marketValue / Math.abs(qty) : 0;
                      const mult      = isOption(sym) ? 100 : 1;
                      const pnl       = (mark - avg) * qty * mult;
                      const pnlPct    = avg > 0 ? ((mark - avg) / avg * 100) : 0;
                      const mktVal    = pos.marketValue ?? 0;
                      return (
                        <tr key={i}
                          style={{ borderBottom:'1px solid var(--border)', height:rowHeight, cursor:'context-menu' }}
                          onContextMenu={e => onRightClick(e, pos)}
                          onMouseEnter={e => (e.currentTarget.style.background='var(--bg-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                          <td style={{ padding:'0 12px', fontFamily:'JetBrains Mono,monospace', fontWeight:700, fontSize:12, overflow:'hidden', whiteSpace:'nowrap' }}>
                            {isOption(sym) ? formatSym(sym) : sym}
                          </td>
                          <td style={{ padding:'0 12px', textAlign:'right', fontFamily:'JetBrains Mono,monospace', fontSize:12, color: qty>0?'var(--green)':'var(--red)' }}>{qty>0?'+':''}{qty}</td>
                          <td style={{ padding:'0 12px', textAlign:'right', fontFamily:'JetBrains Mono,monospace', fontSize:12 }}>${avg.toFixed(2)}</td>
                          <td style={{ padding:'0 12px', textAlign:'right', fontFamily:'JetBrains Mono,monospace', fontSize:12 }}>${mark.toFixed(2)}</td>
                          <td style={{ padding:'0 12px', textAlign:'right', fontFamily:'JetBrains Mono,monospace', fontSize:12, color:pnl>=0?'var(--green)':'var(--red)', fontWeight:600 }}>{pnl>=0?'+':''}${pnl.toFixed(2)}</td>
                          <td style={{ padding:'0 12px', textAlign:'right', fontFamily:'JetBrains Mono,monospace', fontSize:12, color:pnlPct>=0?'var(--green)':'var(--red)' }}>{pnlPct>=0?'+':''}{pnlPct.toFixed(2)}%</td>
                          <td style={{ padding:'0 12px', textAlign:'right', fontFamily:'JetBrains Mono,monospace', fontSize:12 }}>${mktVal.toFixed(2)}</td>
                          <td style={{ width:16 }}/>
                        </tr>
                      );
                    })
                  }
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab !== 'open' && (() => {
          const statusMap = { working:'WORKING', filled:'FILLED', rejected:'REJECTED' };
          const filtered  = filteredOrders(statusMap[activeTab]);
          return (
            <div className="card" style={{ padding:0, overflow:'hidden' }}>
              <div style={{ overflowX:'auto' }}>
                <table style={{ borderCollapse:'collapse', tableLayout:'fixed', width: oWidths.reduce((a,b)=>a+b,0)+'px' }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid var(--border)' }}>
                      {COL_LABELS_ORDERS.map((h,i) => (
                        <th key={i} style={{ width:oWidths[i], padding:'8px 12px', textAlign:i===0?'left':'right', fontSize:10, fontWeight:600, color:'var(--text-muted)', letterSpacing:'0.05em', position:'relative', userSelect:'none' }}>
                          {h}
                          <div onMouseDown={e=>oResize(i,e)} style={{ position:'absolute', right:0, top:0, bottom:0, width:6, cursor:'col-resize' }}>
                            <div style={{ width:2, height:14, background:'var(--border-strong)', margin:'auto', borderRadius:1, opacity:0.5 }}/>
                          </div>
                        </th>
                      ))}
                      <th style={{ width:16, padding:0, position:'relative' }}>
                        <div onMouseDown={oRowResize} style={{ position:'absolute', bottom:0, left:0, right:0, height:6, cursor:'row-resize' }}>
                          <div style={{ width:14, height:2, background:'var(--border-strong)', margin:'auto', borderRadius:1, opacity:0.5 }}/>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length===0
                      ? <tr><td colSpan={9} style={{ padding:40, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>No {activeTab} orders</td></tr>
                      : filtered.map((o: any) => {
                        const leg = o.orderLegCollection?.[0];
                        const sym = leg?.instrument?.symbol ?? '—';
                        const side = leg?.instruction ?? '—';
                        return (
                          <tr key={o.orderId} style={{ borderBottom:'1px solid var(--border)', height:oRowH }}
                            onMouseEnter={e=>(e.currentTarget.style.background='var(--bg-hover)')}
                            onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                            <td style={{ padding:'0 12px', fontFamily:'JetBrains Mono,monospace', fontWeight:700, fontSize:12 }}>{isOption(sym)?formatSym(sym):sym}</td>
                            <td style={{ padding:'0 12px', textAlign:'right' }}><span style={{ fontSize:11, fontWeight:700, color:side.includes('BUY')?'var(--green)':'var(--red)' }}>{side}</span></td>
                            <td style={{ padding:'0 12px', textAlign:'right', fontSize:11, color:'var(--text-secondary)' }}>{o.orderType}</td>
                            <td style={{ padding:'0 12px', textAlign:'right', fontFamily:'JetBrains Mono,monospace', fontSize:12 }}>{o.quantity}</td>
                            <td style={{ padding:'0 12px', textAlign:'right', fontFamily:'JetBrains Mono,monospace', fontSize:12 }}>{o.filledQuantity}</td>
                            <td style={{ padding:'0 12px', textAlign:'right', fontFamily:'JetBrains Mono,monospace', fontSize:12 }}>{o.price?`$${o.price.toFixed(2)}`:'MKT'}</td>
                            <td style={{ padding:'0 12px', textAlign:'right' }}><span className={`badge ${o.status==='FILLED'?'badge-green':o.status==='REJECTED'?'badge-red':'badge-blue'}`}>{o.status}</span></td>
                            <td style={{ padding:'0 12px', textAlign:'right', fontSize:11, color:'var(--text-muted)', whiteSpace:'nowrap' }}>{o.enteredTime?new Date(o.enteredTime).toLocaleTimeString():'—'}</td>
                            <td style={{ width:16 }}/>
                          </tr>
                        );
                      })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div ref={contextRef} style={{
          position:'fixed', left:contextMenu.x, top:contextMenu.y, zIndex:1000,
          background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10,
          boxShadow:'0 8px 24px rgba(0,0,0,0.3)', padding:8, minWidth:200,
        }}>
          {/* Position info header */}
          <div style={{ padding:'6px 10px', marginBottom:4, borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontSize:12, fontWeight:700, fontFamily:'JetBrains Mono,monospace' }}>
              {(() => { const s = contextMenu.position.instrument?.symbol ?? ''; return isOption(s) ? formatSym(s) : s; })()}
            </div>
            <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:2 }}>
              Qty: {contextMenu.position.longQuantity || contextMenu.position.shortQuantity || 0}
            </div>
          </div>

          {flattenMode === null && <>
            <button onClick={() => flatten('market')}
              style={{ display:'block', width:'100%', padding:'8px 12px', textAlign:'left', background:'none', border:'none', cursor:'pointer', fontSize:12, fontWeight:600, color:'var(--red)', borderRadius:6 }}
              onMouseEnter={e=>(e.currentTarget.style.background='var(--red-bg)')}
              onMouseLeave={e=>(e.currentTarget.style.background='none')}>
              🔴 Flatten — Market
            </button>
            <button onClick={() => setFlattenMode('limit')}
              style={{ display:'block', width:'100%', padding:'8px 12px', textAlign:'left', background:'none', border:'none', cursor:'pointer', fontSize:12, fontWeight:600, color:'var(--amber)', borderRadius:6 }}
              onMouseEnter={e=>(e.currentTarget.style.background='var(--amber-bg)')}
              onMouseLeave={e=>(e.currentTarget.style.background='none')}>
              🟡 Flatten — Limit
            </button>
            <button onClick={() => setContextMenu(null)}
              style={{ display:'block', width:'100%', padding:'8px 12px', textAlign:'left', background:'none', border:'none', cursor:'pointer', fontSize:12, color:'var(--text-muted)', borderRadius:6 }}>
              Cancel
            </button>
          </>}

          {flattenMode === 'limit' && (
            <div style={{ padding:'8px 10px' }}>
              <label style={{ fontSize:10, fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:6 }}>LIMIT PRICE</label>
              <input type="number" step="0.01" value={limitPrice} onChange={e=>setLimitPrice(e.target.value)}
                placeholder="0.00" autoFocus
                style={{ width:'100%', fontSize:13, marginBottom:8 }}/>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={() => flatten('limit')}
                  style={{ flex:1, padding:'7px', borderRadius:7, border:'none', cursor:'pointer', fontWeight:600, fontSize:12, background:'var(--red)', color:'white' }}>
                  Flatten
                </button>
                <button onClick={() => setFlattenMode(null)}
                  style={{ flex:1, padding:'7px', borderRadius:7, border:'1px solid var(--border)', cursor:'pointer', fontSize:12, background:'transparent', color:'var(--text-muted)' }}>
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
