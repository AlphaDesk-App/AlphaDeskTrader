import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { api } from '../services/api';

interface OptionsOrderFormProps {
  accountHash: string;
  defaultSymbol?: string;
}

export default function OptionsOrderForm({ accountHash, defaultSymbol = 'SPY' }: OptionsOrderFormProps) {
  const [symbol, setSymbol]               = useState(defaultSymbol);
  const [symInput, setSymInput]           = useState(defaultSymbol);
  const [optionType, setOptionType]       = useState<'CALL'|'PUT'>('CALL');
  const [side, setSide]                   = useState<'BUY_TO_OPEN'|'SELL_TO_CLOSE'>('BUY_TO_OPEN');
  const [qty, setQty]                     = useState('1');
  const [orderType, setOrderType]         = useState<'MARKET'|'LIMIT'>('LIMIT');
  const [price, setPrice]                 = useState('');
  const [selectedOption, setSelectedOption] = useState<any>(null);
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [chain, setChain]                 = useState<any>(null);
  const [chainLoading, setChainLoading]   = useState(false);
  const [status, setStatus]               = useState<'idle'|'confirm'|'loading'|'success'|'error'>('idle');
  const [msg, setMsg]                     = useState('');

  const loadChain = useCallback(async () => {
    if (!symbol) return;
    setChainLoading(true);
    setChain(null);
    setSelectedOption(null);
    try {
      const data = await api.getOptionsChain(symbol, optionType);
      setChain(data);
      const expiries = Object.keys(optionType === 'CALL' ? (data?.callExpDateMap ?? {}) : (data?.putExpDateMap ?? {}));
      if (expiries.length) setSelectedExpiry(expiries[0]);
    } catch {
      setChain(null);
    } finally {
      setChainLoading(false);
    }
  }, [symbol, optionType]);

  useEffect(() => { loadChain(); }, [loadChain]);

  const getStrikes = () => {
    if (!chain || !selectedExpiry) return [];
    const map = optionType === 'CALL' ? chain.callExpDateMap : chain.putExpDateMap;
    return (Object.values(map?.[selectedExpiry] ?? {}).flat() as any[]).slice(0, 25);
  };

  const placeOrder = async () => {
    if (!selectedOption) { setMsg('Select a contract first'); setStatus('error'); setTimeout(() => setStatus('idle'), 2000); return; }
    if (status === 'idle') { setStatus('confirm'); return; }
    if (status !== 'confirm') return;
    setStatus('loading');
    try {
      const order = {
        orderType,
        session: 'NORMAL',
        duration: 'DAY',
        orderStrategyType: 'SINGLE',
        ...(orderType === 'LIMIT' && price ? { price: parseFloat(price) } : {}),
        orderLegCollection: [{
          instruction: side,
          quantity: parseInt(qty),
          instrument: {
            symbol: selectedOption.symbol,
            assetType: 'OPTION',
            optionDeliverables: [],
          },
        }],
      };
      await api.placeOrder(accountHash, order);
      setStatus('success');
      setMsg(`${side.replace('_', ' ')} ${qty} ${selectedOption.symbol}`);
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e: any) {
      setStatus('error');
      setMsg(e.message);
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  return (
    <div className="card">
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 14 }}>OPTIONS ORDER</div>

      {/* Symbol */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input
          value={symInput}
          onChange={e => setSymInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && setSymbol(symInput)}
          style={{ flex: 1, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}
          placeholder="SPY"
        />
        <button onClick={() => setSymbol(symInput)} className="btn btn-primary" style={{ padding: '7px 12px' }}>Go</button>
        <button onClick={loadChain} className="btn btn-secondary" style={{ padding: '7px 8px' }}><RefreshCw size={13} /></button>
      </div>

      {/* Call / Put */}
      <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 8, padding: 3, marginBottom: 12 }}>
        {(['CALL', 'PUT'] as const).map(t => (
          <button key={t} onClick={() => setOptionType(t)}
            style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
              background: optionType === t ? (t === 'CALL' ? 'var(--green)' : 'var(--red)') : 'transparent',
              color: optionType === t ? 'white' : 'var(--text-muted)' }}
          >{t}</button>
        ))}
      </div>

      {/* Buy/Sell */}
      <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 8, padding: 3, marginBottom: 12 }}>
        {([['BUY_TO_OPEN', 'Buy to Open'], ['SELL_TO_CLOSE', 'Sell to Close']] as const).map(([val, label]) => (
          <button key={val} onClick={() => { setSide(val); setStatus('idle'); }}
            style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
              background: side === val ? (val === 'BUY_TO_OPEN' ? 'var(--green)' : 'var(--red)') : 'transparent',
              color: side === val ? 'white' : 'var(--text-muted)' }}
          >{label}</button>
        ))}
      </div>

      {/* Expiry */}
      {chain && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 4 }}>EXPIRATION</label>
          <select value={selectedExpiry} onChange={e => { setSelectedExpiry(e.target.value); setSelectedOption(null); }} style={{ width: '100%', fontSize: 12 }}>
            {Object.keys(optionType === 'CALL' ? (chain?.callExpDateMap ?? {}) : (chain?.putExpDateMap ?? {})).map(exp => (
              <option key={exp} value={exp}>{exp.split(':')[0]}</option>
            ))}
          </select>
        </div>
      )}

      {/* Strikes */}
      {chainLoading && <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>Loading chain...</div>}

      {chain && !chainLoading && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 6 }}>SELECT STRIKE</div>
          <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)' }}>
                <tr>
                  {['Strike', 'Bid', 'Ask', 'Δ', 'Θ', 'Vol'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: 'right', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {getStrikes().map((opt: any, i: number) => {
                  const isSelected = selectedOption?.symbol === opt.symbol;
                  const isITM = optionType === 'CALL'
                    ? opt.strikePrice < (chain?.underlyingPrice ?? 0)
                    : opt.strikePrice > (chain?.underlyingPrice ?? 0);
                  return (
                    <tr key={i} onClick={() => { setSelectedOption(opt); setPrice(opt.ask?.toFixed(2) ?? ''); }}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer',
                        background: isSelected ? 'var(--accent-muted)' : isITM ? 'var(--bg-secondary)' : 'transparent' }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isITM ? 'var(--bg-secondary)' : 'transparent'; }}
                    >
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: isSelected ? 'var(--accent)' : isITM ? 'var(--green)' : 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>{opt.strikePrice}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{opt.bid?.toFixed(2) ?? '--'}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{opt.ask?.toFixed(2) ?? '--'}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--amber)' }}>{opt.delta?.toFixed(2) ?? '--'}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--red)' }}>{opt.theta?.toFixed(3) ?? '--'}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }}>{opt.totalVolume ?? '--'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Selected contract */}
      {selectedOption && (
        <div style={{ background: 'var(--accent-muted)', border: '1px solid var(--accent)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 11 }}>
          <div style={{ fontWeight: 600, color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{selectedOption.symbol}</div>
          <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
            Δ {selectedOption.delta?.toFixed(2)} · Γ {selectedOption.gamma?.toFixed(3)} · Θ {selectedOption.theta?.toFixed(3)} · IV {selectedOption.volatility?.toFixed(1)}%
          </div>
        </div>
      )}

      {/* Qty + Price */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 4 }}>CONTRACTS</label>
          <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 4 }}>ORDER TYPE</label>
          <select value={orderType} onChange={e => setOrderType(e.target.value as any)} style={{ width: '100%' }}>
            <option value="LIMIT">Limit</option>
            <option value="MARKET">Market</option>
          </select>
        </div>
      </div>

      {orderType === 'LIMIT' && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 4 }}>LIMIT PRICE $</label>
          <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" style={{ width: '100%' }} />
        </div>
      )}

      {/* Status messages */}
      {status === 'confirm' && (
        <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertTriangle size={14} color="var(--amber)" style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 11, color: 'var(--amber)', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600 }}>Confirm Options Order</div>
              <div>{side.replace('_', ' ')} {qty} contract{parseInt(qty) > 1 ? 's' : ''}</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>{selectedOption?.symbol}</div>
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
        <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 11, color: 'var(--red)' }}>
          {msg}
        </div>
      )}

      <button onClick={placeOrder} disabled={status === 'loading' || !selectedOption}
        style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', cursor: (!selectedOption || status === 'loading') ? 'not-allowed' : 'pointer',
          fontWeight: 600, fontSize: 13, transition: 'all 0.15s',
          background: status === 'confirm' ? 'var(--amber)' : side === 'BUY_TO_OPEN' ? 'var(--green)' : 'var(--red)',
          color: 'white', opacity: (!selectedOption || status === 'loading') ? 0.5 : 1 }}
      >
        {status === 'loading' ? 'Placing...' : status === 'confirm' ? '⚠️ Confirm Order' : selectedOption ? `${side.replace('_TO_', ' ')} ${qty}x ${selectedOption.strikePrice}${optionType[0]}` : 'Select a contract'}
      </button>

      {status === 'confirm' && (
        <button onClick={() => setStatus('idle')}
          style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          Cancel
        </button>
      )}
    </div>
  );
}
