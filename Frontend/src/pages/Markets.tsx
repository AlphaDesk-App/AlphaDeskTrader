import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import Header from '../components/Header';
import QuoteTicker from '../components/QuoteTicker';
import Watchlist from '../components/Watchlist';

const DEFAULT_INDICES = ['SPY', 'QQQ', 'IWM', 'DIA', 'VIX'];

export default function Markets() {
  const [indices, setIndices] = useState<string[]>(() => {
    const saved = localStorage.getItem('alphaDesk_indices');
    return saved ? JSON.parse(saved) : DEFAULT_INDICES;
  });
  const [indInput, setIndInput] = useState('');
  const [selected, setSelected] = useState('SPY');

  const addIndex = () => {
    const sym = indInput.trim().toUpperCase();
    if (sym && !indices.includes(sym)) {
      const updated = [...indices, sym];
      setIndices(updated);
      localStorage.setItem('alphaDesk_indices', JSON.stringify(updated));
    }
    setIndInput('');
  };

  const removeIndex = (sym: string) => {
    const updated = indices.filter(s => s !== sym);
    setIndices(updated);
    localStorage.setItem('alphaDesk_indices', JSON.stringify(updated));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header title="Markets" subtitle="Live quotes & watchlist" />

      <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '220px 1fr', gap: 0 }}>

        {/* Left: Watchlist */}
        <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto', padding: 12 }}>
          <Watchlist onSelectSymbol={setSelected} />
        </div>

        {/* Right: Market quotes */}
        <div style={{ overflowY: 'auto', padding: 20 }}>

          {/* Indices section — editable */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>INDICES</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={indInput} onChange={e => setIndInput(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && addIndex()}
                  placeholder="Add symbol..." style={{ fontSize: 12, width: 120, padding: '5px 10px' }} />
                <button onClick={addIndex} className="btn btn-primary" style={{ padding: '5px 10px', fontSize: 12 }}>
                  <Plus size={12} />
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {indices.map(sym => (
                <div key={sym} style={{ position: 'relative' }} onClick={() => setSelected(sym)}>
                  <QuoteTicker symbol={sym} />
                  <button onClick={e => { e.stopPropagation(); removeIndex(sym); }}
                    style={{ position: 'absolute', top: 8, right: 8, background: 'var(--bg-tertiary)', border: 'none', borderRadius: 4, padding: '2px 4px', cursor: 'pointer', color: 'var(--text-muted)', opacity: 0.7 }}>
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Watchlist symbols */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 12 }}>YOUR WATCHLIST</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {['AMD','NVDA','TSLA','PLTR','AAPL','MSFT'].map(sym => (
                <div key={sym} onClick={() => setSelected(sym)} style={{ cursor: 'pointer' }}>
                  <QuoteTicker symbol={sym} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
