import { useState } from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { api } from '../services/api';

interface OrderFormProps {
  accountHash: string;
  defaultSymbol?: string;
}

export default function OrderForm({ accountHash, defaultSymbol = 'SPY' }: OrderFormProps) {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('LIMIT');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [status, setStatus] = useState<'idle' | 'confirm' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async () => {
    if (status === 'idle') {
      setStatus('confirm');
      return;
    }
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
          instrument: { symbol: symbol.toUpperCase(), assetType: 'EQUITY' },
        }],
      };
      await api.placeOrder(accountHash, order);
      setStatus('success');
      setMessage(`${side} ${qty} ${symbol.toUpperCase()} order placed!`);
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e: any) {
      setStatus('error');
      setMessage(e.message);
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  return (
    <div className="card">
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 14, letterSpacing: '0.05em' }}>
        ORDER ENTRY
      </div>

      {/* Buy / Sell Toggle */}
      <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 8, padding: 3, marginBottom: 14 }}>
        {(['BUY', 'SELL'] as const).map(s => (
          <button
            key={s}
            onClick={() => { setSide(s); setStatus('idle'); }}
            style={{
              flex: 1, padding: '7px', borderRadius: 6, border: 'none',
              cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
              background: side === s
                ? s === 'BUY' ? 'var(--green)' : 'var(--red)'
                : 'transparent',
              color: side === s ? 'white' : 'var(--text-muted)',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Symbol */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 4 }}>SYMBOL</label>
        <input
          value={symbol}
          onChange={e => setSymbol(e.target.value.toUpperCase())}
          style={{ width: '100%', textTransform: 'uppercase', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}
          placeholder="SPY"
        />
      </div>

      {/* Order Type */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 4 }}>ORDER TYPE</label>
        <select value={orderType} onChange={e => setOrderType(e.target.value as any)} style={{ width: '100%' }}>
          <option value="LIMIT">Limit</option>
          <option value="MARKET">Market</option>
        </select>
      </div>

      {/* Qty and Price */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 4 }}>QTY</label>
          <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} style={{ width: '100%' }} />
        </div>
        {orderType === 'LIMIT' && (
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 4 }}>LIMIT $</label>
            <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" style={{ width: '100%' }} />
          </div>
        )}
      </div>

      {/* Status messages */}
      {status === 'confirm' && (
        <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertTriangle size={15} color="var(--amber)" style={{ marginTop: 1, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--amber)' }}>Confirm Order</div>
            <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 2 }}>
              {side} {qty} share{parseInt(qty) > 1 ? 's' : ''} of {symbol.toUpperCase()}
              {orderType === 'LIMIT' && price ? ` @ $${price}` : ' at market price'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--amber)', marginTop: 2, opacity: 0.8 }}>⚠️ This is a REAL order on your Schwab account</div>
          </div>
        </div>
      )}

      {status === 'success' && (
        <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <CheckCircle size={15} color="var(--green)" />
          <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 500 }}>{message}</span>
        </div>
      )}

      {status === 'error' && (
        <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--red)', fontWeight: 500 }}>Error: {message}</div>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={status === 'loading'}
        style={{
          width: '100%', padding: '10px', borderRadius: 8, border: 'none',
          cursor: status === 'loading' ? 'not-allowed' : 'pointer',
          fontWeight: 600, fontSize: 13, transition: 'all 0.15s',
          background: status === 'confirm'
            ? 'var(--amber)'
            : side === 'BUY' ? 'var(--green)' : 'var(--red)',
          color: 'white',
          opacity: status === 'loading' ? 0.7 : 1,
        }}
      >
        {status === 'loading' ? 'Placing...' :
         status === 'confirm' ? `⚠️ Confirm ${side} ${qty} ${symbol}` :
         `${side} ${symbol.toUpperCase()}`}
      </button>

      {status === 'confirm' && (
        <button
          onClick={() => setStatus('idle')}
          style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}
        >
          Cancel
        </button>
      )}
    </div>
  );
}
