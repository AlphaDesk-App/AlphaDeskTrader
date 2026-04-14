import { useState } from 'react';
import { XCircle, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import Header from '../components/Header';
import { api } from '../services/api';
import { useAccountHash } from '../hooks/useAccountHash';
import { useLiveOrders } from '../hooks/useLiveOrders';
import { useColumnWidths, useRowHeight } from '../hooks/useResizable';

const ORDER_TYPES = ['Limit', 'Market', 'Stop', 'Stop Limit', 'Bracket OCO'];

const STATUS_COLORS: Record<string, string> = {
  WORKING: 'badge-blue', FILLED: 'badge-green',
  CANCELED: 'badge-amber', REJECTED: 'badge-red',
  PENDING_ACTIVATION: 'badge-blue',
};

const COL_DEFAULTS = [100, 60, 80, 50, 55, 70, 110, 100, 40];
const COL_LABELS   = ['Symbol','Side','Type','Qty','Filled','Price','Status','Time',''];

export default function Orders() {
  const { accountHash }               = useAccountHash();
  const { orders, loading }           = useLiveOrders(accountHash);
  const [orderTab, setOrderTab]       = useState<'equity'|'options'>('equity');
  const [cancelling, setCancelling]   = useState<number|null>(null);
  const { widths, startResize }       = useColumnWidths('orders_table', COL_DEFAULTS);
  const { rowHeight, startRowResize } = useRowHeight('orders_table', 40);

  // Equity order state
  const [side, setSide]               = useState<'BUY'|'SELL'>('BUY');
  const [orderType, setOrderType]     = useState('Limit');
  const [qty, setQty]                 = useState('1');
  const [symbol, setSymbol]           = useState('SPY');
  const [price, setPrice]             = useState('');
  const [stopPrice, setStopPrice]     = useState('');
  const [target, setTarget]           = useState('');
  const [orderStatus, setOrderStatus] = useState<'idle'|'confirm'|'loading'|'success'|'error'>('idle');
  const [orderMsg, setOrderMsg]       = useState('');

  // Options state
  const [chain, setChain]             = useState<any>(null);
  const [optSymbol, setOptSymbol]     = useState('SPY');
  const [optType, setOptType]         = useState<'CALL'|'PUT'>('CALL');
  const [expiry, setExpiry]           = useState('');
  const [selectedOpt, setSelectedOpt] = useState<any>(null);
  const [optQty, setOptQty]           = useState('1');
  const [optOrderType, setOptOrderType] = useState('Limit');
  const [optPrice, setOptPrice]       = useState('');
  const [optTarget, setOptTarget]     = useState('');
  const [optStop, setOptStop]         = useState('');
  const [optStatus, setOptStatus]     = useState<'idle'|'confirm'|'loading'|'success'|'error'>('idle');
  const [optMsg, setOptMsg]           = useState('');
  const [chainLoading, setChainLoading] = useState(false);

  const isBracket    = orderType === 'Bracket OCO';
  const isOptBracket = optOrderType === 'Bracket OCO';

  const cancel = async (orderId: number) => {
    setCancelling(orderId);
    try { await api.cancelOrder(accountHash, String(orderId)); }
    catch (e: any) { alert('Cancel failed: ' + e.message); }
    finally { setCancelling(null); }
  };

  const placeEquityOrder = async () => {
    if (orderStatus === 'idle') { setOrderStatus('confirm'); return; }
    if (orderStatus !== 'confirm') return;
    setOrderStatus('loading');
    try {
      const closeInstr = side === 'BUY' ? 'SELL' : 'BUY_TO_COVER';
      let order: any;
      if (isBracket) {
        order = { orderStrategyType: 'TRIGGER', session: 'NORMAL', duration: 'GOOD_TILL_CANCEL', orderType: 'LIMIT', price: parseFloat(price),
          orderLegCollection: [{ instruction: side, quantity: parseInt(qty), instrument: { symbol: symbol.toUpperCase(), assetType: 'EQUITY' } }],
          childOrderStrategies: [{ orderStrategyType: 'OCO', childOrderStrategies: [
            { orderStrategyType: 'SINGLE', session: 'NORMAL', duration: 'GOOD_TILL_CANCEL', orderType: 'LIMIT', price: parseFloat(target), orderLegCollection: [{ instruction: closeInstr, quantity: parseInt(qty), instrument: { symbol: symbol.toUpperCase(), assetType: 'EQUITY' } }] },
            { orderStrategyType: 'SINGLE', session: 'NORMAL', duration: 'GOOD_TILL_CANCEL', orderType: 'STOP', stopPrice: parseFloat(stopPrice), orderLegCollection: [{ instruction: closeInstr, quantity: parseInt(qty), instrument: { symbol: symbol.toUpperCase(), assetType: 'EQUITY' } }] },
          ]}],
        };
      } else {
        order = { orderType: orderType.toUpperCase().replace(' ','_'), session: 'NORMAL', duration: 'DAY', orderStrategyType: 'SINGLE',
          ...(orderType !== 'Market' && price ? { price: parseFloat(price) } : {}),
          ...(orderType === 'Stop' || orderType === 'Stop Limit' ? { stopPrice: parseFloat(stopPrice) } : {}),
          orderLegCollection: [{ instruction: side, quantity: parseInt(qty), instrument: { symbol: symbol.toUpperCase(), assetType: 'EQUITY' } }],
        };
      }
      await api.placeOrder(accountHash, order);
      setOrderStatus('success'); setOrderMsg(`${side} ${qty} ${symbol} placed!`);
      setTimeout(() => setOrderStatus('idle'), 3000);
    } catch (e: any) { setOrderStatus('error'); setOrderMsg(e.message); setTimeout(() => setOrderStatus('idle'), 4000); }
  };

  const loadChain = async () => {
    setChainLoading(true);
    try {
      const data = await api.getOptionsChain(optSymbol, optType);
      setChain(data);
      const exps = Object.keys(optType === 'CALL' ? (data?.callExpDateMap ?? {}) : (data?.putExpDateMap ?? {}));
      if (exps.length) setExpiry(exps[0]);
    } catch { setChain(null); }
    finally { setChainLoading(false); }
  };

  const placeOptionsOrder = async () => {
    if (!selectedOpt) { setOptStatus('error'); setOptMsg('Select a contract first'); setTimeout(() => setOptStatus('idle'), 2000); return; }
    if (optStatus === 'idle') { setOptStatus('confirm'); return; }
    if (optStatus !== 'confirm') return;
    setOptStatus('loading');
    try {
      const closeInstr = 'SELL_TO_CLOSE';
      let order: any;
      if (isOptBracket) {
        order = { orderStrategyType: 'TRIGGER', session: 'NORMAL', duration: 'GOOD_TILL_CANCEL', orderType: 'LIMIT', price: parseFloat(optPrice),
          orderLegCollection: [{ instruction: 'BUY_TO_OPEN', quantity: parseInt(optQty), instrument: { symbol: selectedOpt.symbol, assetType: 'OPTION' } }],
          childOrderStrategies: [{ orderStrategyType: 'OCO', childOrderStrategies: [
            { orderStrategyType: 'SINGLE', session: 'NORMAL', duration: 'GOOD_TILL_CANCEL', orderType: 'LIMIT', price: parseFloat(optTarget), orderLegCollection: [{ instruction: closeInstr, quantity: parseInt(optQty), instrument: { symbol: selectedOpt.symbol, assetType: 'OPTION' } }] },
            { orderStrategyType: 'SINGLE', session: 'NORMAL', duration: 'GOOD_TILL_CANCEL', orderType: 'STOP', stopPrice: parseFloat(optStop), orderLegCollection: [{ instruction: closeInstr, quantity: parseInt(optQty), instrument: { symbol: selectedOpt.symbol, assetType: 'OPTION' } }] },
          ]}],
        };
      } else {
        order = { orderType: optOrderType.toUpperCase().replace(' ','_'), session: 'NORMAL', duration: 'DAY', orderStrategyType: 'SINGLE',
          ...(optOrderType !== 'Market' && optPrice ? { price: parseFloat(optPrice) } : {}),
          orderLegCollection: [{ instruction: 'BUY_TO_OPEN', quantity: parseInt(optQty), instrument: { symbol: selectedOpt.symbol, assetType: 'OPTION' } }],
        };
      }
      await api.placeOrder(accountHash, order);
      setOptStatus('success'); setOptMsg(`Placed ${optQty}x ${selectedOpt.symbol}`);
      setTimeout(() => setOptStatus('idle'), 3000);
    } catch (e: any) { setOptStatus('error'); setOptMsg(e.message); setTimeout(() => setOptStatus('idle'), 4000); }
  };

  const getStrikes = () => {
    if (!chain || !expiry) return [];
    const map = optType === 'CALL' ? chain.callExpDateMap : chain.putExpDateMap;
    return (Object.values(map?.[expiry] ?? {}).flat() as any[]).slice(0, 20);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header title="Orders" subtitle="Live order management" />
      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, padding: 16, alignItems: 'start', overflowY: 'auto' }}>

        {/* Orders table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>ORDERS ({orders.length})</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="live-dot" /><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Live</span>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: widths.reduce((a,b)=>a+b,0)+'px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {COL_LABELS.map((h, i) => (
                      <th key={i} style={{ width: widths[i], padding: '8px 12px', textAlign: i === 0 || i === COL_LABELS.length-1 ? 'left' : 'right', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', position: 'relative', userSelect: 'none', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {h}
                        <div onMouseDown={e => startResize(i, e)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize' }}>
                          <div style={{ width: 2, height: 14, background: 'var(--border-strong)', margin: 'auto', borderRadius: 1, opacity: 0.5 }} />
                        </div>
                      </th>
                    ))}
                    <th style={{ width: 16, padding: 0, position: 'relative' }}>
                      <div onMouseDown={startRowResize} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, cursor: 'row-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 14, height: 2, background: 'var(--border-strong)', borderRadius: 1, opacity: 0.5 }} />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr><td colSpan={COL_LABELS.length+1} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No orders found</td></tr>
                  ) : orders.map((order: any) => {
                    const leg = order.orderLegCollection?.[0];
                    const sym = leg?.instrument?.symbol ?? '--';
                    const s   = leg?.instruction ?? '--';
                    const isWorking = ['WORKING','PENDING_ACTIVATION'].includes(order.status);
                    return (
                      <tr key={order.orderId} style={{ borderBottom: '1px solid var(--border)', height: rowHeight }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '0 12px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 12, overflow: 'hidden', whiteSpace: 'nowrap' }}>{sym}</td>
                        <td style={{ padding: '0 12px', textAlign: 'right' }}><span style={{ fontSize: 11, fontWeight: 700, color: s.includes('BUY') ? 'var(--green)' : 'var(--red)' }}>{s}</span></td>
                        <td style={{ padding: '0 12px', textAlign: 'right', fontSize: 11, color: 'var(--text-secondary)' }}>{order.orderType}</td>
                        <td style={{ padding: '0 12px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{order.quantity}</td>
                        <td style={{ padding: '0 12px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{order.filledQuantity}</td>
                        <td style={{ padding: '0 12px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{order.price ? `$${order.price.toFixed(2)}` : 'MKT'}</td>
                        <td style={{ padding: '0 12px', textAlign: 'right' }}><span className={`badge ${STATUS_COLORS[order.status] ?? 'badge-amber'}`}>{order.status}</span></td>
                        <td style={{ padding: '0 12px', textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{order.enteredTime ? new Date(order.enteredTime).toLocaleTimeString() : '--'}</td>
                        <td style={{ padding: '0 12px' }}>
                          {isWorking && <button onClick={() => cancel(order.orderId)} disabled={cancelling === order.orderId} style={{ background: 'var(--red-bg)', border: 'none', borderRadius: 5, padding: '3px 5px', cursor: 'pointer', color: 'var(--red)' }}><XCircle size={12} /></button>}
                        </td>
                        <td style={{ width: 16 }} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Order entry */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: '10px 10px 0 0', border: '1px solid var(--border)', borderBottom: 'none' }}>
            {(['equity','options'] as const).map(tab => (
              <button key={tab} onClick={() => setOrderTab(tab)}
                style={{ flex: 1, padding: '10px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: orderTab === tab ? 'var(--bg-card)' : 'transparent',
                  color: orderTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                  borderRadius: orderTab === tab ? '10px 10px 0 0' : '0',
                  borderBottom: orderTab === tab ? '2px solid var(--accent)' : '2px solid transparent', transition: 'all 0.15s', textTransform: 'capitalize' }}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: 16, background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Equity order */}
            {orderTab === 'equity' && (
              <>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>SYMBOL</label>
                  <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} style={{ width: '100%', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }} />
                </div>

                <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 8, padding: 3 }}>
                  {(['BUY','SELL'] as const).map(s => (
                    <button key={s} onClick={() => { setSide(s); setOrderStatus('idle'); }}
                      style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        background: side === s ? (s === 'BUY' ? 'var(--green)' : 'var(--red)') : 'transparent',
                        color: side === s ? 'white' : 'var(--text-muted)' }}>
                      {s}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>ORDER TYPE</label>
                    <select value={orderType} onChange={e => setOrderType(e.target.value)} style={{ width: '100%', fontSize: 12 }}>
                      {ORDER_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>QTY</label>
                    <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} style={{ width: '100%', fontSize: 12 }} />
                  </div>
                </div>

                {orderType !== 'Market' && (
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>{isBracket ? 'ENTRY $' : 'PRICE $'}</label>
                    <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} style={{ width: '100%', fontSize: 12 }} />
                  </div>
                )}

                {(orderType === 'Stop' || orderType === 'Stop Limit') && (
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>STOP $</label>
                    <input type="number" step="0.01" value={stopPrice} onChange={e => setStopPrice(e.target.value)} style={{ width: '100%', fontSize: 12 }} />
                  </div>
                )}

                {isBracket && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>TARGET $</label>
                      <input type="number" step="0.01" value={target} onChange={e => setTarget(e.target.value)} style={{ width: '100%', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>STOP $</label>
                      <input type="number" step="0.01" value={stopPrice} onChange={e => setStopPrice(e.target.value)} style={{ width: '100%', fontSize: 12 }} />
                    </div>
                  </div>
                )}

                {orderStatus === 'confirm' && (
                  <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--amber)', display: 'flex', gap: 8 }}>
                    <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>⚠️ {side} {qty} {symbol} {isBracket ? `Entry $${price} Target $${target} Stop $${stopPrice}` : `@ $${price}`}<br /><span style={{ opacity: 0.8 }}>Real Schwab order</span></div>
                  </div>
                )}
                {orderStatus === 'success' && <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--green)', display: 'flex', gap: 8 }}><CheckCircle size={13} />{orderMsg}</div>}
                {orderStatus === 'error'   && <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--red)' }}>{orderMsg}</div>}

                <button onClick={placeEquityOrder} disabled={orderStatus === 'loading'}
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                    background: orderStatus === 'confirm' ? 'var(--amber)' : side === 'BUY' ? 'var(--green)' : 'var(--red)',
                    color: 'white', opacity: orderStatus === 'loading' ? 0.7 : 1 }}>
                  {orderStatus === 'loading' ? 'Placing...' : orderStatus === 'confirm' ? '⚠️ Confirm' : `${side} ${symbol}`}
                </button>
                {orderStatus === 'confirm' && <button onClick={() => setOrderStatus('idle')} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>Cancel</button>}
              </>
            )}

            {/* Options order */}
            {orderTab === 'options' && (
              <>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={optSymbol} onChange={e => setOptSymbol(e.target.value.toUpperCase())} style={{ flex: 1, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }} placeholder="SPY" />
                  <button onClick={loadChain} className="btn btn-primary" style={{ padding: '6px 10px', fontSize: 12 }}>
                    {chainLoading ? <RefreshCw size={12} /> : 'Load'}
                  </button>
                </div>

                <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 8, padding: 3 }}>
                  {(['CALL','PUT'] as const).map(t => (
                    <button key={t} onClick={() => setOptType(t)}
                      style={{ flex: 1, padding: '6px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                        background: optType === t ? (t === 'CALL' ? 'var(--green)' : 'var(--red)') : 'transparent',
                        color: optType === t ? 'white' : 'var(--text-muted)' }}>
                      {t}
                    </button>
                  ))}
                </div>

                {chain && (
                  <select value={expiry} onChange={e => { setExpiry(e.target.value); setSelectedOpt(null); }} style={{ width: '100%', fontSize: 12 }}>
                    {Object.keys(optType === 'CALL' ? (chain?.callExpDateMap ?? {}) : (chain?.putExpDateMap ?? {})).map(exp => (
                      <option key={exp} value={exp}>{exp.split(':')[0]}</option>
                    ))}
                  </select>
                )}

                {chain && (
                  <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)' }}>
                        <tr>{['Strike','Bid','Ask','Δ','IV'].map(h => <th key={h} style={{ padding: '5px 6px', textAlign: 'right', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {getStrikes().map((opt: any, i: number) => {
                          const isSel = selectedOpt?.symbol === opt.symbol;
                          const isITM = optType === 'CALL' ? opt.strikePrice < (chain?.underlyingPrice ?? 0) : opt.strikePrice > (chain?.underlyingPrice ?? 0);
                          return (
                            <tr key={i} onClick={() => { setSelectedOpt(opt); setOptPrice(opt.ask?.toFixed(2) ?? ''); }}
                              style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isSel ? 'var(--accent-muted)' : isITM ? 'var(--bg-secondary)' : 'transparent' }}>
                              <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 700, color: isSel ? 'var(--accent)' : isITM ? 'var(--green)' : 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>{opt.strikePrice}</td>
                              <td style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{opt.bid?.toFixed(2)}</td>
                              <td style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{opt.ask?.toFixed(2)}</td>
                              <td style={{ padding: '5px 6px', textAlign: 'right', color: 'var(--amber)' }}>{opt.delta?.toFixed(2)}</td>
                              <td style={{ padding: '5px 6px', textAlign: 'right', color: 'var(--text-muted)' }}>{opt.volatility?.toFixed(0)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {selectedOpt && (
                  <div style={{ background: 'var(--accent-muted)', borderRadius: 8, padding: '8px 10px', fontSize: 11 }}>
                    <div style={{ fontWeight: 600, color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>{selectedOpt.symbol}</div>
                    <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>Δ {selectedOpt.delta?.toFixed(2)} · Θ {selectedOpt.theta?.toFixed(3)} · IV {selectedOpt.volatility?.toFixed(1)}%</div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>ORDER TYPE</label>
                    <select value={optOrderType} onChange={e => setOptOrderType(e.target.value)} style={{ width: '100%', fontSize: 12 }}>
                      {ORDER_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>CONTRACTS</label>
                    <input type="number" min="1" value={optQty} onChange={e => setOptQty(e.target.value)} style={{ width: '100%', fontSize: 12 }} />
                  </div>
                </div>

                {optOrderType !== 'Market' && (
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>{isOptBracket ? 'ENTRY $' : 'PRICE $'}</label>
                    <input type="number" step="0.01" value={optPrice} onChange={e => setOptPrice(e.target.value)} style={{ width: '100%', fontSize: 12 }} />
                  </div>
                )}

                {isOptBracket && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>TARGET $</label>
                      <input type="number" step="0.01" value={optTarget} onChange={e => setOptTarget(e.target.value)} style={{ width: '100%', fontSize: 12 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>STOP $</label>
                      <input type="number" step="0.01" value={optStop} onChange={e => setOptStop(e.target.value)} style={{ width: '100%', fontSize: 12 }} />
                    </div>
                  </div>
                )}

                {optStatus === 'confirm' && <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--amber)' }}>⚠️ {isOptBracket ? `Bracket OCO: Entry $${optPrice} Target $${optTarget} Stop $${optStop}` : `${optQty}x ${selectedOpt?.symbol} @ $${optPrice}`}<br /><span style={{ opacity: 0.8 }}>Real Schwab order</span></div>}
                {optStatus === 'success' && <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--green)', display: 'flex', gap: 8 }}><CheckCircle size={13} />{optMsg}</div>}
                {optStatus === 'error'   && <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--red)' }}>{optMsg}</div>}

                <button onClick={placeOptionsOrder} disabled={optStatus === 'loading' || !selectedOpt}
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                    background: optStatus === 'confirm' ? 'var(--amber)' : 'var(--green)', color: 'white',
                    opacity: (!selectedOpt || optStatus === 'loading') ? 0.5 : 1 }}>
                  {optStatus === 'loading' ? 'Placing...' : optStatus === 'confirm' ? '⚠️ Confirm' : selectedOpt ? `Buy ${optQty}x ${selectedOpt.strikePrice}${optType[0]}` : 'Select a contract'}
                </button>
                {optStatus === 'confirm' && <button onClick={() => setOptStatus('idle')} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>Cancel</button>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
