import { useState } from 'react';
import { Plus, X, TrendingUp, TrendingDown } from 'lucide-react';
import { useQuote } from '../hooks/useQuote';

const DEFAULT_WATCHLIST = ['SPY', 'QQQ', 'AMD', 'NVDA', 'TSLA', 'PLTR', 'AAPL', 'MSFT'];

function WatchlistRow({ symbol, onRemove, onSelect }: { symbol: string; onRemove: () => void; onSelect: () => void }) {
  const { data } = useQuote(symbol);
  const quote = data?.[symbol]?.quote ?? data?.[symbol] ?? null;
  const last = quote?.lastPrice ?? 0;
  const change = quote?.netChange ?? 0;
  const changePct = quote?.netPercentChange ?? 0;
  const isPos = change >= 0;

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', padding: '8px 14px',
        borderBottom: '1px solid var(--border)', cursor: 'pointer',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }}>{symbol}</div>
      </div>
      <div style={{ textAlign: 'right', marginRight: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
          {last ? `$${last.toFixed(2)}` : '---'}
        </div>
        <div style={{
          fontSize: 11, fontWeight: 600,
          color: isPos ? 'var(--green)' : 'var(--red)',
          display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end'
        }}>
          {isPos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {isPos ? '+' : ''}{changePct.toFixed(2)}%
        </div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onRemove(); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, opacity: 0.5 }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

interface WatchlistProps {
  onSelectSymbol?: (symbol: string) => void;
}

export default function Watchlist({ onSelectSymbol }: WatchlistProps) {
  const [symbols, setSymbols] = useState<string[]>(() => {
    const saved = localStorage.getItem('alphaDesk_watchlist');
    return saved ? JSON.parse(saved) : DEFAULT_WATCHLIST;
  });
  const [input, setInput] = useState('');

  const save = (list: string[]) => {
    setSymbols(list);
    localStorage.setItem('alphaDesk_watchlist', JSON.stringify(list));
  };

  const add = () => {
    const sym = input.trim().toUpperCase();
    if (sym && !symbols.includes(sym)) save([...symbols, sym]);
    setInput('');
  };

  const remove = (sym: string) => save(symbols.filter(s => s !== sym));

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 10 }}>WATCHLIST</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="Add symbol..."
            style={{ flex: 1, fontSize: 12 }}
          />
          <button onClick={add} className="btn btn-primary" style={{ padding: '6px 10px' }}>
            <Plus size={13} />
          </button>
        </div>
      </div>
      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        {symbols.map(sym => (
          <WatchlistRow
            key={sym}
            symbol={sym}
            onRemove={() => remove(sym)}
            onSelect={() => onSelectSymbol?.(sym)}
          />
        ))}
      </div>
    </div>
  );
}
