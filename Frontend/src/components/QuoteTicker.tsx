import { useQuote } from '../hooks/useQuote';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface QuoteTickerProps {
  symbol: string;
}

function fmt(n: number) {
  return n?.toFixed(2) ?? '--';
}

function fmtVol(n: number) {
  if (!n) return '--';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return n.toString();
}

export default function QuoteTicker({ symbol }: QuoteTickerProps) {
  const { data } = useQuote(symbol);

  const quote = data?.[symbol]?.quote ?? data?.[symbol] ?? null;

  const last = quote?.lastPrice ?? quote?.last ?? 0;
  const change = quote?.netChange ?? quote?.regularMarketNetChange ?? 0;
  const changePct = quote?.netPercentChange ?? quote?.regularMarketPercentChange ?? 0;
  const high = quote?.highPrice ?? quote?.regularMarketDayHigh ?? 0;
  const low = quote?.lowPrice ?? quote?.regularMarketDayLow ?? 0;
  const vol = quote?.totalVolume ?? quote?.regularMarketVolume ?? 0;
  const bid = quote?.bidPrice ?? 0;
  const ask = quote?.askPrice ?? 0;

  const isPositive = change >= 0;

  return (
    <div className="card" style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: isPositive ? 'var(--green)' : 'var(--red)',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            {symbol}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '-0.02em', lineHeight: 1.1, marginTop: 2 }}>
            {last ? `$${fmt(last)}` : '---'}
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '4px 8px', borderRadius: 6,
          background: isPositive ? 'var(--green-bg)' : 'var(--red-bg)',
          color: isPositive ? 'var(--green)' : 'var(--red)',
          fontSize: 12, fontWeight: 600,
        }}>
          {isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {isPositive ? '+' : ''}{fmt(change)} ({isPositive ? '+' : ''}{fmt(changePct)}%)
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8, marginTop: 8,
        padding: '10px 0',
        borderTop: '1px solid var(--border)',
      }}>
        {[
          { label: 'Bid', value: `$${fmt(bid)}` },
          { label: 'Ask', value: `$${fmt(ask)}` },
          { label: 'Vol', value: fmtVol(vol) },
          { label: 'High', value: `$${fmt(high)}` },
          { label: 'Low', value: `$${fmt(low)}` },
          { label: 'Spread', value: `$${fmt(ask - bid)}` },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 1 }}>{label}</div>
            <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
