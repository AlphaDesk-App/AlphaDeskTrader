import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi } from 'lightweight-charts';
import { Search, ChevronDown, Settings2 } from 'lucide-react';
import Header from '../components/Header';
import { api } from '../services/api';
import { useAccountHash } from '../hooks/useAccountHash';

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }
interface Indicators { pdLevels: boolean; pmLevels: boolean; orLevels: boolean; ema9: boolean; ema20: boolean; ema50: boolean; fvg: boolean; }

const TIMEFRAMES = [
  { label: '1m',  periodType: 'day',   period: 1, frequencyType: 'minute',  frequency: 1  },
  { label: '2m',  periodType: 'day',   period: 1, frequencyType: 'minute',  frequency: 2  },
  { label: '5m',  periodType: 'day',   period: 1, frequencyType: 'minute',  frequency: 5  },
  { label: '15m', periodType: 'day',   period: 1, frequencyType: 'minute',  frequency: 15 },
  { label: '30m', periodType: 'day',   period: 1, frequencyType: 'minute',  frequency: 30 },
  { label: '1h',  periodType: 'day',   period: 5, frequencyType: 'minute',  frequency: 30 },
  { label: '4h',  periodType: 'month', period: 1, frequencyType: 'daily',   frequency: 1  },
  { label: '1D',  periodType: 'month', period: 3, frequencyType: 'daily',   frequency: 1  },
  { label: '1W',  periodType: 'year',  period: 1, frequencyType: 'weekly',  frequency: 1  },
  { label: '1M',  periodType: 'year',  period: 2, frequencyType: 'monthly', frequency: 1  },
  { label: '1Y',  periodType: 'year',  period: 5, frequencyType: 'yearly',  frequency: 1  },
];

const ORDER_TYPES = ['LIMIT','MARKET','STOP','STOP_LIMIT','BRACKET_OCO'] as const;
type OT = typeof ORDER_TYPES[number];

function calcEMA(candles: Candle[], period: number) {
  const k = 2 / (period + 1);
  let ema = candles[0]?.close ?? 0;
  return candles.map((c, i) => { ema = i === 0 ? c.close : c.close * k + ema * (1 - k); return { time: c.time, value: parseFloat(ema.toFixed(4)) }; });
}

function getORLevels(candles: Candle[], orMinutes: number) {
  if (!candles.length) return null;
  const orEnd = candles[0].time + orMinutes * 60;
  const orC   = candles.filter(c => c.time <= orEnd);
  if (!orC.length) return null;
  return { high: Math.max(...orC.map(c => c.high)), low: Math.min(...orC.map(c => c.low)) };
}

const INDICATOR_LABELS: Record<keyof Indicators, string> = {
  pdLevels: 'PD Levels', pmLevels: 'PM Levels', orLevels: 'OR Levels',
  ema9: 'EMA 9', ema20: 'EMA 20', ema50: 'EMA 50', fvg: 'FVG Zones',
};

export default function Charts() {
  const chartRef          = useRef<HTMLDivElement>(null);
  const chartApiRef       = useRef<IChartApi|null>(null);
  const candleRef         = useRef<ISeriesApi<'Candlestick'>|null>(null);
  const volRef            = useRef<ISeriesApi<'Histogram'>|null>(null);
  const ema9Ref           = useRef<ISeriesApi<'Line'>|null>(null);
  const ema20Ref          = useRef<ISeriesApi<'Line'>|null>(null);
  const ema50Ref          = useRef<ISeriesApi<'Line'>|null>(null);
  const panelRef          = useRef<HTMLDivElement>(null);
  const dragRef           = useRef<{ startY: number; startH: number }|null>(null);

  const { accountHash }   = useAccountHash();

  const [symbol, setSymbol]           = useState('QQQ');
  const [searchInput, setSearchInput] = useState('QQQ');
  const [timeframe, setTimeframe]     = useState('5m');
  const [candles, setCandles]         = useState<Candle[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string|null>(null);
  const [orMinutes, setOrMinutes]     = useState<5|10|15|30>(30);
  const [indicators, setIndicators]   = useState<Indicators>({ pdLevels: true, pmLevels: true, orLevels: true, ema9: true, ema20: true, ema50: true, fvg: true });
  const [showIndPanel, setShowIndPanel] = useState(false);
  const [panelHeight, setPanelHeight] = useState(() => parseInt(localStorage.getItem('ad_chart_panel_h') ?? '280'));

  // Order panel state
  const [orderTab, setOrderTab]       = useState<'equity'|'options'>('equity');
  const [side, setSide]               = useState<'BUY'|'SELL'>('BUY');
  const [orderType, setOrderType]     = useState<OT>('LIMIT');
  const [qty, setQty]                 = useState('1');
  const [price, setPrice]             = useState('');
  const [stopPrice, setStopPrice]     = useState('');
  const [profitTarget, setPT]         = useState('');
  const [stopLoss, setSL]             = useState('');
  const [orderStatus, setOrderStatus] = useState<'idle'|'confirm'|'loading'|'success'|'error'>('idle');
  const [orderMsg, setOrderMsg]       = useState('');

  // Options state
  const [chain, setChain]             = useState<any>(null);
  const [optionType, setOptionType]   = useState<'CALL'|'PUT'>('CALL');
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [selectedOption, setSelectedOption] = useState<any>(null);
  const [optSide, setOptSide]             = useState<'BUY_TO_OPEN'|'SELL_TO_OPEN'>('BUY_TO_OPEN');
  const [chainLoading, setChainLoading] = useState(false);
  const [optOrderType, setOptOrderType] = useState<'LIMIT'|'MARKET'|'BRACKET_OCO'>('LIMIT');
  const [optQty, setOptQty]           = useState('1');
  const [optPrice, setOptPrice]       = useState('');
  const [optPT, setOptPT]             = useState('');
  const [optSL, setOptSL]             = useState('');

  // Live quote for order form
  const [liveQuote, setLiveQuote]     = useState<any>(null);

  // Fetch live quote when symbol changes
  useEffect(() => {
    if (!symbol) return;
    api.getQuote(symbol).then(data => {
      const q = data?.[symbol]?.quote ?? data?.[symbol] ?? null;
      setLiveQuote(q);
      if (q?.askPrice) setPrice(q.askPrice.toFixed(2));
    }).catch(() => {});
  }, [symbol]);

  // Init chart
  useEffect(() => {
    if (!chartRef.current) return;
    const isDark = document.documentElement.classList.contains('dark');
    const chart = createChart(chartRef.current, {
      layout: { background: { color: 'transparent' }, textColor: isDark ? '#9090b0' : '#4a4a6a' },
      grid: { vertLines: { color: isDark ? '#1e1e2e' : '#e2e4ea' }, horzLines: { color: isDark ? '#1e1e2e' : '#e2e4ea' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: isDark ? '#1e1e2e' : '#e2e4ea' },
      timeScale: { borderColor: isDark ? '#1e1e2e' : '#e2e4ea', timeVisible: true, secondsVisible: false },
      width: chartRef.current.clientWidth,
      height: chartRef.current.clientHeight,
    });
    candleRef.current = chart.addCandlestickSeries({ upColor: '#22c55e', downColor: '#ef4444', borderUpColor: '#22c55e', borderDownColor: '#ef4444', wickUpColor: '#22c55e', wickDownColor: '#ef4444' });
    volRef.current    = chart.addHistogramSeries({ color: '#2563eb', priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    ema9Ref.current   = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1 });
    ema20Ref.current  = chart.addLineSeries({ color: '#3b82f6', lineWidth: 1 });
    ema50Ref.current  = chart.addLineSeries({ color: '#a855f7', lineWidth: 1 });
    chartApiRef.current = chart;
    const ro = new ResizeObserver(() => { if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth, height: chartRef.current.clientHeight }); });
    ro.observe(chartRef.current);
    return () => { chart.remove(); ro.disconnect(); };
  }, []);

  // Fetch candles
  const fetchCandles = useCallback(async () => {
    if (!symbol) return;
    setLoading(true); setError(null);
    try {
      const tf   = TIMEFRAMES.find(t => t.label === timeframe) ?? TIMEFRAMES[2];
      const data = await api.getPriceHistory(symbol, tf.periodType, tf.period, tf.frequencyType, tf.frequency);
      const raw  = (data?.candles ?? []).map((c: any) => ({ time: Math.floor(c.datetime / 1000), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
      setCandles(raw);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [symbol, timeframe]);

  useEffect(() => { fetchCandles(); }, [fetchCandles]);

  // Update chart
  useEffect(() => {
    const c = candleRef.current; const v = volRef.current;
    const e9 = ema9Ref.current; const e20 = ema20Ref.current; const e50 = ema50Ref.current;
    if (!c || !v || !e9 || !e20 || !e50 || !candles.length) return;
    c.setData(candles.map(x => ({ time: x.time as any, open: x.open, high: x.high, low: x.low, close: x.close })));
    v.setData(candles.map(x => ({ time: x.time as any, value: x.volume, color: x.close >= x.open ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)' })));
    e9.setData(indicators.ema9   ? calcEMA(candles, 9).map(e  => ({ time: e.time as any, value: e.value })) : []);
    e20.setData(indicators.ema20 ? calcEMA(candles, 20).map(e => ({ time: e.time as any, value: e.value })) : []);
    e50.setData(indicators.ema50 ? calcEMA(candles, 50).map(e => ({ time: e.time as any, value: e.value })) : []);
    if (indicators.orLevels) {
      const or = getORLevels(candles, orMinutes);
      if (or) {
        c.createPriceLine({ price: or.high, color: '#f59e0b', lineWidth: 1, lineStyle: 2, title: `OR High (${orMinutes}m)` });
        c.createPriceLine({ price: or.low,  color: '#f59e0b', lineWidth: 1, lineStyle: 2, title: `OR Low (${orMinutes}m)` });
      }
    }
    chartApiRef.current?.timeScale().fitContent();
  }, [candles, indicators, orMinutes]);

  // Panel resize drag
  const startPanelDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: panelHeight };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const newH = Math.max(180, Math.min(600, dragRef.current.startH - (ev.clientY - dragRef.current.startY)));
      setPanelHeight(newH);
      localStorage.setItem('ad_chart_panel_h', String(newH));
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Load options chain
  const loadChain = useCallback(async () => {
    if (!symbol || orderTab !== 'options') return;
    setChainLoading(true);
    try {
      const data = await api.getOptionsChain(symbol, optionType);
      setChain(data);
      const expiries = Object.keys(optionType === 'CALL' ? (data?.callExpDateMap ?? {}) : (data?.putExpDateMap ?? {}));
      if (expiries.length) setSelectedExpiry(expiries[0]);
    } catch { setChain(null); }
    finally { setChainLoading(false); }
  }, [symbol, optionType, orderTab]);

  useEffect(() => { loadChain(); }, [loadChain]);

  // Place equity order
  const placeEquityOrder = async () => {
    const isBracket = orderType === 'BRACKET_OCO';
    if (orderStatus === 'idle') { setOrderStatus('confirm'); return; }
    if (orderStatus !== 'confirm') return;
    setOrderStatus('loading');
    try {
      const sym = symbol.toUpperCase(); const q = parseInt(qty);
      const closeInstr = side === 'BUY' ? 'SELL' : 'BUY_TO_COVER';
      const order = isBracket
        ? { orderStrategyType: 'TRIGGER', session: 'NORMAL', duration: 'GOOD_TILL_CANCEL', orderType: 'LIMIT', price: parseFloat(price), orderLegCollection: [{ instruction: side, quantity: q, instrument: { symbol: sym, assetType: 'EQUITY' } }], childOrderStrategies: [{ orderStrategyType: 'OCO', childOrderStrategies: [{ orderStrategyType: 'SINGLE', session: 'NORMAL', duration: 'GOOD_TILL_CANCEL', orderType: 'LIMIT', price: parseFloat(profitTarget), orderLegCollection: [{ instruction: closeInstr, quantity: q, instrument: { symbol: sym, assetType: 'EQUITY' } }] }, { orderStrategyType: 'SINGLE', session: 'NORMAL', duration: 'GOOD_TILL_CANCEL', orderType: 'STOP', stopPrice: parseFloat(stopLoss), orderLegCollection: [{ instruction: closeInstr, quantity: q, instrument: { symbol: sym, assetType: 'EQUITY' } }] }] }] }
        : { orderType, session: 'NORMAL', duration: 'DAY', orderStrategyType: 'SINGLE', ...(price && orderType !== 'MARKET' ? { price: parseFloat(price) } : {}), orderLegCollection: [{ instruction: side, quantity: q, instrument: { symbol: sym, assetType: 'EQUITY' } }] };
      await api.placeOrder(accountHash, order);
      setOrderStatus('success'); setOrderMsg(`${side} ${qty} ${sym} placed!`);
      setTimeout(() => setOrderStatus('idle'), 3000);
    } catch (e: any) { setOrderStatus('error'); setOrderMsg(e.message); setTimeout(() => setOrderStatus('idle'), 4000); }
  };

  // Options chain strikes
  const getStrikes = () => {
    if (!chain || !selectedExpiry) return [];
    const map = optionType === 'CALL' ? chain.callExpDateMap : chain.putExpDateMap;
    return (Object.values(map?.[selectedExpiry] ?? {}).flat() as any[]).slice(0, 30);
  };

  const isBracket = orderType === 'BRACKET_OCO';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header title="Charts" subtitle="Live candlestick charts with indicators" />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Chart area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '12px 12px 0', gap: 8, minHeight: 0 }}>

          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input value={searchInput} onChange={e => setSearchInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter') setSymbol(searchInput); }}
                  style={{ paddingLeft: 28, width: 100, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }} placeholder="QQQ" />
              </div>
              <button onClick={() => setSymbol(searchInput)} className="btn btn-primary" style={{ padding: '7px 12px' }}>Go</button>
            </div>

            {/* Live quote mini display */}
            {liveQuote && (
              <div style={{ display: 'flex', gap: 10, background: 'var(--bg-secondary)', borderRadius: 8, padding: '5px 12px', fontSize: 12 }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>${(liveQuote.lastPrice ?? 0).toFixed(2)}</span>
                <span style={{ color: 'var(--text-muted)' }}>B: ${(liveQuote.bidPrice ?? 0).toFixed(2)}</span>
                <span style={{ color: 'var(--text-muted)' }}>A: ${(liveQuote.askPrice ?? 0).toFixed(2)}</span>
                <span style={{ color: (liveQuote.netChange ?? 0) >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                  {(liveQuote.netChange ?? 0) >= 0 ? '+' : ''}{(liveQuote.netChange ?? 0).toFixed(2)} ({(liveQuote.netPercentChange ?? 0).toFixed(2)}%)
                </span>
              </div>
            )}

            {/* Timeframes */}
            <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 8, padding: 3, gap: 2, flexWrap: 'wrap' }}>
              {TIMEFRAMES.map(tf => (
                <button key={tf.label} onClick={() => setTimeframe(tf.label)}
                  style={{ padding: '5px 9px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
                    background: timeframe === tf.label ? 'var(--accent)' : 'transparent',
                    color: timeframe === tf.label ? 'white' : 'var(--text-muted)' }}
                >{tf.label}</button>
              ))}
            </div>

            {/* OR selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>OR:</span>
              <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 8, padding: 3, gap: 2 }}>
                {([5, 10, 15, 30] as const).map(m => (
                  <button key={m} onClick={() => setOrMinutes(m)}
                    style={{ padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                      background: orMinutes === m ? 'var(--amber)' : 'transparent',
                      color: orMinutes === m ? 'white' : 'var(--text-muted)' }}
                  >{m}m</button>
                ))}
              </div>
            </div>

            {/* Indicators */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowIndPanel(!showIndPanel)} className="btn btn-secondary" style={{ fontSize: 11, padding: '6px 10px' }}>
                <Settings2 size={12} /> Indicators <ChevronDown size={11} />
              </button>
              {showIndPanel && (
                <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 200, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, width: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
                  {(Object.keys(indicators) as (keyof Indicators)[]).map(key => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{INDICATOR_LABELS[key]}</span>
                      <div onClick={() => setIndicators(prev => ({ ...prev, [key]: !prev[key] }))}
                        style={{ width: 36, height: 20, borderRadius: 10, background: indicators[key] ? 'var(--green)' : 'var(--border)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
                        <div style={{ width: 16, height: 16, borderRadius: 8, background: 'white', position: 'absolute', top: 2, left: indicators[key] ? 18 : 2, transition: 'left 0.2s' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {loading && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Loading {symbol}...</span>}
            {error   && <span style={{ fontSize: 11, color: 'var(--red)' }}>Error: {error}</span>}
          </div>

          {/* Chart */}
          <div style={{ flex: 1, position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-card)', minHeight: 0 }}>
            <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
            {loading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)', fontSize: 13, color: 'var(--text-muted)' }}>Loading {symbol} {timeframe}...</div>}
          </div>
        </div>

        {/* Drag handle */}
        <div onMouseDown={startPanelDrag}
          style={{ height: 6, cursor: 'row-resize', background: 'var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--border)')}
        >
          <div style={{ width: 40, height: 2, background: 'var(--text-muted)', borderRadius: 1 }} />
        </div>

        {/* Bottom panel */}
        <div ref={panelRef} style={{ height: panelHeight, flexShrink: 0, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-secondary)' }}>

          {/* Tabs centered */}
          <div style={{ display: 'flex', justifyContent: 'center', borderBottom: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
            {(['equity','options'] as const).map(tab => (
              <button key={tab} onClick={() => setOrderTab(tab)}
                style={{ padding: '10px 32px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
                  background: orderTab === tab ? 'var(--bg-primary)' : 'transparent',
                  color: orderTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                  borderBottom: orderTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                  textTransform: 'capitalize' }}
              >{tab.charAt(0).toUpperCase() + tab.slice(1)}</button>
            ))}
          </div>

          {/* Panel content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', display: 'grid', gridTemplateColumns: orderTab === 'options' ? '280px 1fr' : '320px 1fr', gap: 16 }}>

            {/* ── EQUITY ORDER FORM ── */}
            {orderTab === 'equity' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 15, color: 'var(--accent)' }}>{symbol}</div>

                  {/* Side */}
                  <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 8, padding: 3 }}>
                    {(['BUY','SELL'] as const).map(s => (
                      <button key={s} onClick={() => { setSide(s); setOrderStatus('idle'); }}
                        style={{ flex: 1, padding: '6px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                          background: side === s ? (s === 'BUY' ? 'var(--green)' : 'var(--red)') : 'transparent',
                          color: side === s ? 'white' : 'var(--text-muted)' }}
                      >{s}</button>
                    ))}
                  </div>

                  {/* Order type */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 3 }}>ORDER TYPE</label>
                      <select value={orderType} onChange={e => setOrderType(e.target.value as OT)} style={{ width: '100%', fontSize: 12 }}>
                        <option value="LIMIT">Limit</option>
                        <option value="MARKET">Market</option>
                        <option value="STOP">Stop</option>
                        <option value="STOP_LIMIT">Stop Limit</option>
                        <option value="BRACKET_OCO">Bracket OCO</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 3 }}>SHARES</label>
                      <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} style={{ width: '100%', fontSize: 12 }} />
                    </div>
                  </div>

                  {/* Price fields */}
                  {!isBracket && orderType !== 'MARKET' && (
                    <div>
                      <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 3 }}>PRICE $</label>
                      <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" style={{ width: '100%', fontSize: 12 }} />
                    </div>
                  )}

                  {isBracket && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                      {[{ l: 'ENTRY', v: price, s: setPrice }, { l: 'TARGET', v: profitTarget, s: setPT }, { l: 'STOP', v: stopLoss, s: setSL }].map(({ l, v, s }) => (
                        <div key={l}>
                          <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 3 }}>{l} $</label>
                          <input type="number" step="0.01" value={v} onChange={e => s(e.target.value)} placeholder="0.00" style={{ width: '100%', fontSize: 11 }} />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Status / Submit */}
                  {orderStatus === 'confirm' && <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: 'var(--amber)' }}>⚠️ Confirm {side} {qty} {symbol} — Real order on Schwab</div>}
                  {orderStatus === 'success' && <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: 'var(--green)' }}>✓ {orderMsg}</div>}
                  {orderStatus === 'error'   && <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: 'var(--red)' }}>{orderMsg}</div>}

                  <button onClick={placeEquityOrder} disabled={orderStatus === 'loading'}
                    style={{ width: '100%', padding: '9px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                      background: orderStatus === 'confirm' ? 'var(--amber)' : isBracket ? 'var(--accent)' : side === 'BUY' ? 'var(--green)' : 'var(--red)',
                      color: 'white', opacity: orderStatus === 'loading' ? 0.7 : 1 }}>
                    {orderStatus === 'loading' ? 'Placing...' : orderStatus === 'confirm' ? '⚠️ Confirm' : isBracket ? `Bracket OCO` : `${side} ${symbol}`}
                  </button>
                  {orderStatus === 'confirm' && <button onClick={() => setOrderStatus('idle')} style={{ width: '100%', padding: '7px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>Cancel</button>}
                </div>

                {/* Right side — market info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {liveQuote && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {[
                        { l: 'Last',   v: `$${(liveQuote.lastPrice ?? 0).toFixed(2)}` },
                        { l: 'Bid',    v: `$${(liveQuote.bidPrice  ?? 0).toFixed(2)}` },
                        { l: 'Ask',    v: `$${(liveQuote.askPrice  ?? 0).toFixed(2)}` },
                        { l: 'High',   v: `$${(liveQuote.highPrice ?? 0).toFixed(2)}` },
                        { l: 'Low',    v: `$${(liveQuote.lowPrice  ?? 0).toFixed(2)}` },
                        { l: 'Volume', v: ((liveQuote.totalVolume ?? 0) / 1000000).toFixed(1) + 'M' },
                      ].map(({ l, v }) => (
                        <div key={l} className="card" style={{ padding: '8px 10px' }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>{l}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── OPTIONS CHAIN ── */}
            {orderTab === 'options' && (
              <>
                {/* Left: options order controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 13, color: 'var(--accent)' }}>{symbol} — ${chain?.underlyingPrice?.toFixed(2) ?? '--'}</div>

                  {/* Expiry */}
                  {chain && (
                    <div>
                      <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 3 }}>EXPIRATION</label>
                      <select value={selectedExpiry} onChange={e => { setSelectedExpiry(e.target.value); setSelectedOption(null); }} style={{ width: '100%', fontSize: 11 }}>
                        {Object.keys(chain?.callExpDateMap ?? {}).map(exp => <option key={exp} value={exp}>{exp.split(':')[0]}</option>)}
                      </select>
                    </div>
                  )}

                  {/* Order type */}
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 3 }}>ORDER TYPE</label>
                    <select value={optOrderType} onChange={e => setOptOrderType(e.target.value as any)} style={{ width: '100%', fontSize: 11 }}>
                      <option value="LIMIT">Limit</option>
                      <option value="MARKET">Market</option>
                      <option value="BRACKET_OCO">Bracket OCO</option>
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div>
                      <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 3 }}>CONTRACTS</label>
                      <input type="number" min="1" value={optQty} onChange={e => setOptQty(e.target.value)} style={{ width: '100%', fontSize: 11 }} />
                    </div>
                    {optOrderType === 'LIMIT' && (
                      <div>
                        <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 3 }}>PRICE $</label>
                        <input type="number" step="0.01" value={optPrice} onChange={e => setOptPrice(e.target.value)} placeholder="0.00" style={{ width: '100%', fontSize: 11 }} />
                      </div>
                    )}
                  </div>

                  {optOrderType === 'BRACKET_OCO' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                      {[{ l: 'ENTRY', v: optPrice, s: setOptPrice }, { l: 'TARGET', v: optPT, s: setOptPT }, { l: 'STOP', v: optSL, s: setOptSL }].map(({ l, v, s }) => (
                        <div key={l}>
                          <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 3 }}>{l} $</label>
                          <input type="number" step="0.01" value={v} onChange={e => s(e.target.value)} placeholder="0.00" style={{ width: '100%', fontSize: 11 }} />
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedOption && (
                    <div style={{ background: optionType === 'CALL' ? 'var(--green-bg)' : 'var(--red-bg)', border: `1px solid ${optionType === 'CALL' ? 'var(--green)' : 'var(--red)'}`, borderRadius: 8, padding: '6px 10px', fontSize: 10, color: optionType === 'CALL' ? 'var(--green)' : 'var(--red)', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 700 }}>{optSide === 'BUY_TO_OPEN' ? 'BUY' : 'SELL'} {optionType} · {selectedOption.symbol}</div>
                      <div style={{ color: 'var(--text-secondary)' }}>Δ{selectedOption.delta?.toFixed(2)} Γ{selectedOption.gamma?.toFixed(3)} Θ{selectedOption.theta?.toFixed(3)} IV{selectedOption.volatility?.toFixed(0)}%</div>
                    </div>
                  )}

                  {/* Place Order button */}
                  {selectedOption && (
                    <>
                      {orderStatus === 'confirm_opt' && (
                        <div style={{ background:'var(--amber-bg)', border:'1px solid var(--amber)', borderRadius:8, padding:'8px 10px', fontSize:11, color:'var(--amber)' }}>
                          ⚠️ Confirm: {optSide === 'BUY_TO_OPEN' ? 'BUY' : 'SELL'} {optQty}x {optionType} {selectedOption?.strikePrice} @ ${optPrice || 'MKT'}<br/>
                          <span style={{opacity:0.8}}>Real Schwab order</span>
                        </div>
                      )}
                      {orderStatus === 'success' && <div style={{fontSize:11,color:'var(--green)',padding:'6px 10px',background:'var(--green-bg)',borderRadius:8}}>{orderMsg}</div>}
                      {orderStatus === 'error'   && <div style={{fontSize:11,color:'var(--red)',  padding:'6px 10px',background:'var(--red-bg)',  borderRadius:8}}>{orderMsg}</div>}
                      <button
                        onClick={() => {
                          if (orderStatus === 'idle') { setOrderStatus('confirm_opt' as any); return; }
                          if (orderStatus !== ('confirm_opt' as any)) return;
                          if (!selectedOption || !accountHash) return;
                          const q = parseInt(optQty) || 1;
                          const instr = optSide;
                          const order = optOrderType === 'BRACKET_OCO'
                            ? { orderStrategyType: 'TRIGGER', session: 'NORMAL', duration: 'GOOD_TILL_CANCEL', orderType: 'LIMIT', price: parseFloat(optPrice),
                                orderLegCollection: [{ instruction: instr, quantity: q, instrument: { symbol: selectedOption.symbol, assetType: 'OPTION' } }],
                                childOrderStrategies: [{ orderStrategyType: 'OCO', childOrderStrategies: [
                                  { orderStrategyType: 'SINGLE', session: 'NORMAL', duration: 'GOOD_TILL_CANCEL', orderType: 'LIMIT', price: parseFloat(optPT), orderLegCollection: [{ instruction: 'SELL_TO_CLOSE', quantity: q, instrument: { symbol: selectedOption.symbol, assetType: 'OPTION' } }] },
                                  { orderStrategyType: 'SINGLE', session: 'NORMAL', duration: 'GOOD_TILL_CANCEL', orderType: 'STOP', stopPrice: parseFloat(optSL), orderLegCollection: [{ instruction: 'SELL_TO_CLOSE', quantity: q, instrument: { symbol: selectedOption.symbol, assetType: 'OPTION' } }] },
                                ]}] }
                            : { orderType: optOrderType, session: 'NORMAL', duration: 'DAY', orderStrategyType: 'SINGLE',
                                ...(optOrderType === 'LIMIT' && optPrice ? { price: parseFloat(optPrice) } : {}),
                                orderLegCollection: [{ instruction: instr, quantity: q, instrument: { symbol: selectedOption.symbol, assetType: 'OPTION' } }] };
                          api.placeOrder(accountHash, order)
                            .then(() => {
                              setOrderStatus('success');
                              setOrderMsg(`✓ ${optSide === 'BUY_TO_OPEN' ? 'BUY' : 'SELL'} ${q}x ${optionType} ${selectedOption.strikePrice} placed!`);
                              setTimeout(() => setOrderStatus('idle'), 3000);
                            })
                            .catch((e: any) => {
                              setOrderStatus('error');
                              setOrderMsg(e.message);
                              setTimeout(() => setOrderStatus('idle'), 4000);
                            });
                        }}
                        style={{ width: '100%', padding: '9px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
                          background: orderStatus === ('confirm_opt' as any) ? 'var(--amber)' : optSide === 'BUY_TO_OPEN' ? 'var(--green)' : 'var(--red)', color: 'white' }}>
                        {orderStatus === ('confirm_opt' as any) ? '⚠️ Confirm Order' : `${optSide === 'BUY_TO_OPEN' ? 'BUY' : 'SELL'} ${optQty}x ${optionType} ${selectedOption?.strikePrice} @ $${optPrice || 'MKT'}`}
                      </button>
                      {orderStatus === ('confirm_opt' as any) && (
                        <button onClick={() => setOrderStatus('idle')}
                          style={{ width:'100%', padding:'6px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', cursor:'pointer', fontSize:11, color:'var(--text-muted)' }}>
                          Cancel
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Right: Full options chain Calls | Strike | Puts */}
                <div style={{ overflow: 'auto' }}>
                  {chainLoading && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>Loading chain...</div>}
                  {chain && !chainLoading && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
                        <tr>
                          {['Vol','OI','Delta','Prob ITM','Bid','Ask'].map(h => (
                            <th key={`c-${h}`} style={{ padding: '5px 8px', textAlign: 'right', fontSize: 10, color: 'var(--green)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                          <th style={{ padding: '5px 12px', textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, background: 'var(--bg-tertiary)' }}>STRIKE</th>
                          {['Bid','Ask','Prob ITM','Delta','OI','Vol'].map(h => (
                            <th key={`p-${h}`} style={{ padding: '5px 8px', textAlign: 'right', fontSize: 10, color: 'var(--red)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {getStrikes().map((call: any, i: number) => {
                          // Put lookup — same expiry key, match strike as float string e.g. "587.0"
                          const putExpMap = chain.putExpDateMap ?? {};
                          const putExpKey = selectedExpiry && putExpMap[selectedExpiry]
                            ? selectedExpiry
                            : Object.keys(putExpMap)[0] ?? '';
                          const putMap    = putExpMap[putExpKey] ?? {};
                          // Strike keys are floats as strings: "587.0", "588.0" etc
                          const strikeStr = call.strikePrice?.toString();
                          const putKey    = putMap[strikeStr]
                            ? strikeStr
                            : Object.keys(putMap).find(k => parseFloat(k) === call.strikePrice);
                          const putRaw    = putKey ? putMap[putKey] : null;
                          const put       = putRaw
                            ? (Array.isArray(putRaw) ? putRaw[0] : (Object.values(putRaw as any)[0] as any))
                            : null;
                          const isATM   = Math.abs(call.strikePrice - (chain.underlyingPrice ?? 0)) < 1;
                          const callITM = call.strikePrice < (chain.underlyingPrice ?? 0);
                          const putITM  = call.strikePrice > (chain.underlyingPrice ?? 0);
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: isATM ? 'var(--accent-muted)' : 'transparent' }}>
                              {/* Call side */}
                              <td style={{ padding: '4px 8px', textAlign: 'right', background: callITM ? 'var(--bg-secondary)' : 'transparent', cursor: 'pointer', color: callITM ? 'var(--green)' : 'var(--text-secondary)' }} onClick={() => { setSelectedOption(call); setOptPrice(((call.bid+call.ask)/2).toFixed(2)); setOptionType('CALL'); }}>{call.totalVolume ?? '--'}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'right', background: callITM ? 'var(--bg-secondary)' : 'transparent', cursor: 'pointer' }} onClick={() => { setSelectedOption(call); setOptionType('CALL'); }}>{call.openInterest ?? '--'}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--amber)', background: callITM ? 'var(--bg-secondary)' : 'transparent', cursor: 'pointer' }} onClick={() => { setSelectedOption(call); setOptionType('CALL'); }}>{call.delta?.toFixed(2) ?? '--'}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'right', background: callITM ? 'var(--bg-secondary)' : 'transparent', cursor: 'pointer' }} onClick={() => { setSelectedOption(call); setOptionType('CALL'); }}>{((call.inTheMoney ? call.delta : 1 - Math.abs(call.delta ?? 0)) * 100).toFixed(1)}%</td>
                              <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, background: callITM ? 'var(--bg-secondary)' : 'transparent', cursor: 'pointer' }} onClick={() => { setSelectedOption(call); setOptionType('CALL'); setOptSide('SELL_TO_OPEN'); if (call.bid) setOptPrice(call.bid.toFixed(2)); }}>{call.bid?.toFixed(2) ?? '--'}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, background: callITM ? 'var(--bg-secondary)' : 'transparent', cursor: 'pointer' }} onClick={() => { setSelectedOption(call); setOptionType('CALL'); setOptSide('BUY_TO_OPEN'); if (call.ask) setOptPrice(call.ask.toFixed(2)); }}>{call.ask?.toFixed(2) ?? '--'}</td>

                              {/* Strike */}
                              <td style={{ padding: '4px 12px', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 12, background: isATM ? 'var(--accent)' : 'var(--bg-tertiary)', color: isATM ? 'white' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                {call.strikePrice}
                              </td>

                              {/* Put side */}
                              <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, background: putITM ? 'var(--bg-secondary)' : 'transparent', cursor: 'pointer' }} onClick={() => { if (put) { setSelectedOption(put); setOptionType('PUT'); setOptSide('SELL_TO_OPEN'); if (put.bid) setOptPrice(put.bid.toFixed(2)); } }}>{put?.bid?.toFixed(2) ?? '--'}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, background: putITM ? 'var(--bg-secondary)' : 'transparent', cursor: 'pointer' }} onClick={() => { if (put) { setSelectedOption(put); setOptionType('PUT'); setOptSide('BUY_TO_OPEN'); if (put.ask) setOptPrice(put.ask.toFixed(2)); } }}>{put?.ask?.toFixed(2) ?? '--'}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'right', background: putITM ? 'var(--bg-secondary)' : 'transparent', cursor: 'pointer' }} onClick={() => { if (put) { setSelectedOption(put); setOptionType('PUT'); } }}>{put ? ((put.inTheMoney ? Math.abs(put.delta ?? 0) : 1 - Math.abs(put.delta ?? 0)) * 100).toFixed(1) + '%' : '--'}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--amber)', background: putITM ? 'var(--bg-secondary)' : 'transparent', cursor: 'pointer' }} onClick={() => { if (put) { setSelectedOption(put); setOptionType('PUT'); } }}>{put?.delta?.toFixed(2) ?? '--'}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'right', background: putITM ? 'var(--bg-secondary)' : 'transparent', cursor: 'pointer' }} onClick={() => { if (put) { setSelectedOption(put); setOptionType('PUT'); } }}>{put?.openInterest ?? '--'}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'right', color: putITM ? 'var(--red)' : 'var(--text-secondary)', background: putITM ? 'var(--bg-secondary)' : 'transparent', cursor: 'pointer' }} onClick={() => { if (put) { setSelectedOption(put); setOptionType('PUT'); } }}>{put?.totalVolume ?? '--'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
