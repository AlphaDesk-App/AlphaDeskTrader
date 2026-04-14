import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle, Target } from 'lucide-react';
import { api } from '../services/api';

interface BracketOrderFormProps {
  accountHash: string;
  defaultSymbol?: string;
}

export default function BracketOrderForm({ accountHash, defaultSymbol = 'SPY' }: BracketOrderFormProps) {
  const [orderClass, setOrderClass]   = useState<'equity'|'options'>('equity');
  const [symbol, setSymbol]           = useState(defaultSymbol);
  const [symInput, setSymInput]       = useState(defaultSymbol);
  const [side, setSide]               = useState<'BUY'|'SELL_SHORT'>('BUY');
  const [qty, setQty]                 = useState('1');
  const [entryPrice, setEntryPrice]   = useState('');
  const [profitTarget, setProfitTarget] = useState('');
  const [stopLoss, setStopLoss]       = useState('');
  const [status, setStatus]           = useState<'idle'|'confirm'|'loading'|'success'|'error'>('idle');
  const [msg, setMsg]                 = useState('');

  // Options state
  const [chain, setChain]             = useState<any>(null);
  const [optionType, setOptionType]   = useState<'CALL'|'PUT'>('CALL');
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [selectedOption, setSelectedOption] = useState<any>(null);
  const [chainLoading, setChainLoading] = useState(false);

  const loadChain = useCallback(async () => {
    if (!symbol || orderClass !== 'options') return;
    setChainLoading(true);
    try {
      const data = await api.getOptionsChain(symbol, optionType);
      setChain(data);
      const expiries = Object.keys(optionType === 'CALL' ? (data?.callExpDateMap ?? {}) : (data?.putExpDateMap ?? {}));
      if (expiries.length) setSelectedExpiry(expiries[0]);
    } catch { setChain(null); }
    finally { setChainLoading(false); }
  }, [symbol, optionType, orderClass]);

  useEffect(() => { if (orderClass === 'options') loadChain(); }, [loadChain, orderClass]);

  const getStrikes = () => {
    if (!chain || !selectedExpiry) return [];
    const map = optionType === 'CALL' ? chain.callExpDateMap : chain.putExpDateMap;
    return (Object.values(map?.[selectedExpiry] ?? {}).flat() as any[]).slice(0, 20);
  };

  const buildOrder = () => {
    const isOption = orderClass === 'options';
    const instrSymbol = isOption ? selectedOption?.symbol : symbol.toUpperCase();
    const assetType   = isOption ? 'OPTION' : 'EQUITY';
    const closeInstr  = side === 'BUY' ? 'SELL' : 'BUY_TO_COVER';

    return {
      orderStrategyType: 'TRIGGER',
      session: 'NORMAL',
      duration: 'GOOD_TILL_CANCEL',
      orderType: 'LIMIT',
      price: parseFloat(entryPrice),
      orderLegCollection: [{
        instruction: side,
        quantity: parseInt(qty),
        instrument: { symbol: instrSymbol, assetType },
      }],
      childOrderStrategies: [{
        orderStrategyType: 'OCO',
        childOrderStrategies: [
          {
            orderStrategyType: 'SINGLE',
            session: 'NORMAL',
            duration: 'GOOD_TILL_CANCEL',
            orderType: 'LIMIT',
            price: parseFloat(profitTarget),
            orderLegCollection: [{
              instruction: closeInstr,
              quantity: parseInt(qty),
              instrument: { symbol: instrSymbol, assetType },
            }],
          },
          {
            orderStrategyType: 'SINGLE',
            session: 'NORMAL',
            duration: 'GOOD_TILL_CANCEL',
            orderType: 'STOP',
            stopPrice: parseFloat(stopLoss),
            orderLegCollection: [{
              instruction: closeInstr,
              quantity: parseInt(qty),
              instrument: { symbol: instrSymbol, assetType },
            }],
          },
        ],
      }],
    };
  };

  const placeOrder = async () => {
    if (orderClass === 'options' && !selectedOption) {
      setMsg('Select an options contract first');
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
      return;
    }
    if (!entryPrice || !profitTarget || !stopLoss) {
      setMsg('Fill in entry, profit target, and stop loss');
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
      return;
    }
    if (status === 'idle') { setStatus('confirm'); return; }
    if (status !== 'confirm') return;

    setStatus('loading');
    try {
      await api.placeOrder(accountHash, buildOrder());
      setStatus('success');
      setMsg('Bracket OCO order placed!');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e: any) {
      setStatus('error');
      setMsg(e.message);
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  // Auto-calculate R:R
  const entry = parseFloat(entryPrice) || 0;
  const pt    = parseFloat(profitTarget) || 0;
  const sl    = parseFloat(stopLoss) || 0;
  const reward = side === 'BUY' ? pt - entry : entry - pt;
  const risk   = side === 'BUY' ? entry - sl  : sl - entry;
  const rr     = risk > 0 ? (reward / risk).toFixed(2) : '--';

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Target size={14} color="var(--accent)" />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>BRACKET / OCO ORDER</span>
      </div>

      {/* Equity / Options toggle */}
      <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 8, padding: 3, marginBottom: 12 }}>
        {(['equity', 'options'] as const).map(t => (
          <button key={t} onClick={() => setOrderClass(t)}
            style={{ flex: 1, padding: '6px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s', textTransform: 'capitalize',
              background: orderClass === t ? 'var(--accent)' : 'transparent',
              color: orderClass === t ? 'white' : 'var(--text-muted)' }}
          >{t.charAt(0).toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {/* Symbol */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input value={symInput} onChange={e => setSymInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && setSymbol(symInput)}
          style={{ flex: 1, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }} placeholder="SPY" />
        <button onClick={() => setSymbol(symInput)} className="btn btn-primary" style={{ padding: '7px 12px' }}>Go</button>
      </div>

      {/* Buy / Sell Short */}
      <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 8, padding: 3, marginBottom: 12 }}>
        {([['BUY', 'Buy (Long)'], ['SELL_SHORT', 'Sell Short']] as const).map(([val, label]) => (
          <button key={val} onClick={() => setSide(val)}
            style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
              background: side === val ? (val === 'BUY' ? 'var(--green)' : 'var(--red)') : 'transparent',
              color: side === val ? 'white' : 'var(--text-muted)' }}
          >{label}</button>
        ))}
      </div>

      {/* Options chain */}
      {orderClass === 'options' && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 8, padding: 3, marginBottom: 8 }}>
            {(['CALL','PUT'] as const).map(t => (
              <button key={t} onClick={() => setOptionType(t)}
                style={{ flex: 1, padding: '6px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
                  background: optionType === t ? (t === 'CALL' ? 'var(--green)' : 'var(--red)') : 'transparent',
                  color: optionType === t ? 'white' : 'var(--text-muted)' }}
              >{t}</button>
            ))}
          </div>

          {chain && (
            <select value={selectedExpiry} onChange={e => { setSelectedExpiry(e.target.value); setSelectedOption(null); }} style={{ width: '100%', fontSize: 12, marginBottom: 8 }}>
              {Object.keys(optionType === 'CALL' ? (chain?.callExpDateMap ?? {}) : (chain?.putExpDateMap ?? {})).map(exp => (
                <option key={exp} value={exp}>{exp.split(':')[0]}</option>
              ))}
            </select>
          )}

          {chainLoading && <div style={{ textAlign: 'center', padding: 12, color: 'var(--text-muted)', fontSize: 12 }}>Loading chain...</div>}

          {chain && !chainLoading && (
            <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)' }}>
                  <tr>
                    {['Strike','Bid','Ask','Δ','IV'].map(h => (
                      <th key={h} style={{ padding: '5px 6px', textAlign: 'right', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {getStrikes().map((opt: any, i: number) => {
                    const isSel = selectedOption?.symbol === opt.symbol;
                    const isITM = optionType === 'CALL'
                      ? opt.strikePrice < (chain?.underlyingPrice ?? 0)
                      : opt.strikePrice > (chain?.underlyingPrice ?? 0);
                    return (
                      <tr key={i} onClick={() => { setSelectedOption(opt); setEntryPrice(((opt.bid + opt.ask) / 2).toFixed(2)); }}
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer',
                          background: isSel ? 'var(--accent-muted)' : isITM ? 'var(--bg-secondary)' : 'transparent' }}
                        onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isITM ? 'var(--bg-secondary)' : 'transparent'; }}
                      >
                        <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700, color: isSel ? 'var(--accent)' : isITM ? 'var(--green)' : 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>{opt.strikePrice}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{opt.bid?.toFixed(2)}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{opt.ask?.toFixed(2)}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--amber)' }}>{opt.delta?.toFixed(2)}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--text-muted)' }}>{opt.volatility?.toFixed(0)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {selectedOption && (
            <div style={{ background: 'var(--accent-muted)', borderRadius: 8, padding: '6px 10px', marginBottom: 8, fontSize: 11, color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
              {selectedOption.symbol}
            </div>
          )}
        </div>
      )}

      {/* Qty */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 4 }}>{orderClass === 'options' ? 'CONTRACTS' : 'SHARES'}</label>
        <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} style={{ width: '100%' }} />
      </div>

      {/* Entry / Target / Stop */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
        {[
          { label: 'ENTRY $',  value: entryPrice,   set: setEntryPrice   },
          { label: 'TARGET $', value: profitTarget, set: setProfitTarget },
          { label: 'STOP $',   value: stopLoss,     set: setStopLoss     },
        ].map(({ label, value, set }) => (
          <div key={label}>
            <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4, letterSpacing: '0.04em' }}>{label}</label>
            <input type="number" step="0.01" value={value} onChange={e => set(e.target.value)} placeholder="0.00" style={{ width: '100%', fontSize: 12 }} />
          </div>
        ))}
      </div>

      {/* R:R display */}
      {entry > 0 && pt > 0 && sl > 0 && (
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>REWARD</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', fontFamily: 'JetBrains Mono, monospace' }}>+${(reward * parseInt(qty || '1')).toFixed(2)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>RISK</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', fontFamily: 'JetBrains Mono, monospace' }}>-${(risk * parseInt(qty || '1')).toFixed(2)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>R:R</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: parseFloat(rr) >= 2 ? 'var(--green)' : parseFloat(rr) >= 1 ? 'var(--amber)' : 'var(--red)', fontFamily: 'JetBrains Mono, monospace' }}>{rr}</div>
          </div>
        </div>
      )}

      {/* Status messages */}
      {status === 'confirm' && (
        <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertTriangle size={14} color="var(--amber)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 11, color: 'var(--amber)', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600 }}>Confirm Bracket OCO Order</div>
              <div>{side === 'BUY' ? 'Buy' : 'Sell Short'} {qty} {orderClass === 'options' && selectedOption ? selectedOption.symbol : symbol} @ ${entryPrice}</div>
              <div>Target: ${profitTarget} · Stop: ${stopLoss} · R:R {rr}</div>
              <div style={{ opacity: 0.8, marginTop: 2 }}>⚠️ Real order on your Schwab account</div>
            </div>
          </div>
        </div>
      )}
      {status === 'success' && (
        <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <CheckCircle size={14} color="var(--green)" />
          <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 500 }}>{msg}</span>
        </div>
      )}
      {status === 'error' && (
        <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 11, color: 'var(--red)' }}>{msg}</div>
      )}

      <button onClick={placeOrder} disabled={status === 'loading'}
        style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
          background: status === 'confirm' ? 'var(--amber)' : side === 'BUY' ? 'var(--green)' : 'var(--red)',
          color: 'white', opacity: status === 'loading' ? 0.7 : 1, transition: 'all 0.15s' }}
      >
        {status === 'loading' ? 'Placing...' : status === 'confirm' ? '⚠️ Confirm Bracket Order' : `Place Bracket OCO — ${side === 'BUY' ? 'Long' : 'Short'}`}
      </button>
      {status === 'confirm' && (
        <button onClick={() => setStatus('idle')} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Cancel</button>
      )}
    </div>
  );
}
