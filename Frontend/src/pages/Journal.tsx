import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, BookOpen, RefreshCw, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import Header from '../components/Header';
import DateFilterBar from '../components/DateFilterBar';
import { api } from '../services/api';
import { useAccountHash } from '../hooks/useAccountHash';
import { DateFilter, filterByDate } from '../utils/dateFilter';
import { formatSymbol, isOptionSymbol, getMultiplier } from '../utils/optionsSymbol';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TradeNote { notes: string; setup: string; tags: string[]; rating: number; }

interface PairedTrade {
  key: string; symbol: string; assetType: string; date: string;
  side: 'LONG'|'SHORT'; qty: number;
  entryPrice: number; exitPrice: number;
  entryTime: string; exitTime: string;
  pnl: number; entryOrderId: number; exitOrderId: number;
}

const SETUPS = [
  'OR Breakout','OR Breakdown','PD High Break','PD Low Break',
  'PM High Break','PM Low Break','EMA Bounce','FVG Fill',
  'Trend Continuation','Reversal','Gap Fill','VWAP Reclaim','Custom',
];

const TRADE_TAGS = [
  'Disciplined','Revenge Trade','FOMO','Held Too Long',
  'Cut Early','Perfect Entry','Chased','Patient',
  'Oversize','Good Risk/Reward',
];

// ── Options symbol display ────────────────────────────────────────────────────

function SymbolDisplay({ symbol, assetType }: { symbol: string; assetType: string }) {
  if (assetType === 'OPTION' || isOptionSymbol(symbol)) {
    return (
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }}>
          {formatSymbol(symbol)}
        </div>
        <span className="badge badge-blue" style={{ fontSize: 9, marginTop: 2 }}>OPTION</span>
      </div>
    );
  }
  return <div style={{ fontWeight: 700, fontSize: 14, fontFamily: 'JetBrains Mono, monospace' }}>{symbol}</div>;
}

// ── Trade pairing ─────────────────────────────────────────────────────────────

function pairTrades(orders: any[]): PairedTrade[] {
  const filled = orders.filter(o => o.status === 'FILLED');

  const bySymbolDate: Record<string, any[]> = {};
  filled.forEach(order => {
    const leg = order.orderLegCollection?.[0];
    if (!leg) return;
    const sym  = leg.instrument?.symbol ?? 'UNKNOWN';
    const time = order.closeTime ?? order.enteredTime ?? '';
    const date = time ? new Date(time).toLocaleDateString('en-CA') : 'unknown';
    const key  = `${sym}__${date}`;
    if (!bySymbolDate[key]) bySymbolDate[key] = [];
    bySymbolDate[key].push(order);
  });

  const trades: PairedTrade[] = [];

  Object.entries(bySymbolDate).forEach(([groupKey, groupOrders]) => {
    const [symbol] = groupKey.split('__');
    groupOrders.sort((a, b) =>
      new Date(a.closeTime ?? a.enteredTime ?? 0).getTime() -
      new Date(b.closeTime ?? b.enteredTime ?? 0).getTime()
    );

    const buys:  any[] = [];
    const sells: any[] = [];
    groupOrders.forEach(o => {
      const instr = o.orderLegCollection?.[0]?.instruction ?? '';
      if (instr.includes('BUY'))  buys.push(o);
      if (instr.includes('SELL')) sells.push(o);
    });

    const pairs = Math.min(buys.length, sells.length);
    for (let i = 0; i < pairs; i++) {
      const buyOrder  = buys[i];
      const sellOrder = sells[i];
      const buyLeg    = buyOrder.orderLegCollection?.[0];
      const assetType = buyLeg?.instrument?.assetType ?? 'EQUITY';
      const mult      = getMultiplier(assetType);

      const entryPrice = buyOrder.price  ?? buyOrder.averagePrice  ?? 0;
      const exitPrice  = sellOrder.price ?? sellOrder.averagePrice ?? 0;
      const qty        = buyOrder.filledQuantity ?? buyOrder.quantity ?? 0;
      const entryTime  = buyOrder.closeTime  ?? buyOrder.enteredTime  ?? '';
      const exitTime   = sellOrder.closeTime ?? sellOrder.enteredTime ?? '';
      const pnl        = (exitPrice - entryPrice) * qty * mult;

      trades.push({
        key:          `${symbol}__${buyOrder.orderId}__${sellOrder.orderId}`,
        symbol,
        assetType,
        date:         entryTime ? new Date(entryTime).toLocaleDateString('en-CA') : 'unknown',
        side:         'LONG',
        qty,
        entryPrice,
        exitPrice,
        entryTime,
        exitTime,
        pnl,
        entryOrderId: buyOrder.orderId,
        exitOrderId:  sellOrder.orderId,
      });
    }

    // Also check short trades (sell first, buy to close)
    if (sells.length > buys.length) {
      const shortPairs = sells.length - buys.length;
      for (let i = 0; i < shortPairs; i++) {
        const sellOrder = sells[buys.length + i];
        const buyOrder  = buys[buys.length + i] ?? null;
        if (!buyOrder) continue;
        const assetType = sellOrder.orderLegCollection?.[0]?.instrument?.assetType ?? 'EQUITY';
        const mult      = getMultiplier(assetType);
        const entryPrice = sellOrder.price ?? 0;
        const exitPrice  = buyOrder.price  ?? 0;
        const qty        = sellOrder.filledQuantity ?? sellOrder.quantity ?? 0;
        const entryTime  = sellOrder.closeTime ?? sellOrder.enteredTime ?? '';
        const exitTime   = buyOrder.closeTime  ?? buyOrder.enteredTime  ?? '';
        const pnl        = (entryPrice - exitPrice) * qty * mult;
        trades.push({
          key: `${symbol}__${sellOrder.orderId}__${buyOrder.orderId}`,
          symbol, assetType,
          date: entryTime ? new Date(entryTime).toLocaleDateString('en-CA') : 'unknown',
          side: 'SHORT', qty, entryPrice, exitPrice,
          entryTime, exitTime, pnl,
          entryOrderId: sellOrder.orderId, exitOrderId: buyOrder.orderId,
        });
      }
    }
  });

  return trades.sort((a, b) => new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime());
}

function duration(entry: string, exit: string): string {
  const ms = new Date(exit).getTime() - new Date(entry).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1,2,3,4,5].map(star => (
        <span key={star} onClick={() => onChange(star)}
          style={{ cursor: 'pointer', fontSize: 18, color: star <= value ? 'var(--amber)' : 'var(--border)', transition: 'color 0.1s' }}>
          ★
        </span>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Journal() {
  const { accountHash }               = useAccountHash();
  const [allTrades, setAllTrades]     = useState<PairedTrade[]>([]);
  const [loading, setLoading]         = useState(true);
  const [expandedKey, setExpandedKey] = useState<string|null>(null);
  const [editingKey, setEditingKey]   = useState<string|null>(null);
  const [dateFilter, setDateFilter]   = useState<DateFilter>({ range: 'this_month' });

  const [notes, setNotes] = useState<Record<string, TradeNote>>(() => {
    const saved = localStorage.getItem('alphaDesk_trade_notes');
    return saved ? JSON.parse(saved) : {};
  });
  const [editForm, setEditForm] = useState<TradeNote>({ notes: '', setup: '', tags: [], rating: 0 });

  const loadOrders = useCallback(async () => {
    if (!accountHash) return;
    setLoading(true);
    try {
      const data = await api.getOrders(accountHash);
      setAllTrades(pairTrades(data ?? []));
    } catch {
      setAllTrades([]);
    } finally {
      setLoading(false);
    }
  }, [accountHash]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // Apply date filter
  const trades = filterByDate(allTrades, t => t.entryTime, dateFilter);

  const saveNote = (key: string) => {
    const updated = { ...notes, [key]: editForm };
    setNotes(updated);
    localStorage.setItem('alphaDesk_trade_notes', JSON.stringify(updated));
    setEditingKey(null);
  };

  const startEdit = (key: string) => {
    setEditingKey(key);
    setEditForm(notes[key] ?? { notes: '', setup: '', tags: [], rating: 0 });
  };

  const toggleTag = (tag: string) => setEditForm(prev => ({
    ...prev,
    tags: prev.tags.includes(tag) ? prev.tags.filter(t => t !== tag) : [...prev.tags, tag],
  }));

  // Stats from filtered trades
  const wins     = trades.filter(t => t.pnl > 0);
  const losses   = trades.filter(t => t.pnl < 0);
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const winRate  = trades.length ? Math.round((wins.length / trades.length) * 100) : 0;
  const avgWin   = wins.length   ? wins.reduce((s, t)   => s + t.pnl, 0) / wins.length   : 0;
  const avgLoss  = losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
  const profitFactor = losses.length
    ? Math.abs(wins.reduce((s, t) => s + t.pnl, 0) / losses.reduce((s, t) => s + t.pnl, 0))
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header title="Trade Journal" subtitle="Closed trades from your Schwab account" />
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Total P&L',      value: `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`,  color: totalPnl >= 0 ? 'var(--green)' : 'var(--red)' },
            { label: 'Win Rate',       value: `${winRate}%`,          color: winRate >= 50 ? 'var(--green)' : 'var(--red)' },
            { label: 'Trades',         value: trades.length.toString(), color: 'var(--text-primary)' },
            { label: 'Avg Win',        value: `+$${avgWin.toFixed(2)}`,  color: 'var(--green)' },
            { label: 'Avg Loss',       value: `$${avgLoss.toFixed(2)}`,   color: 'var(--red)' },
            { label: 'Profit Factor',  value: profitFactor.toFixed(2),   color: profitFactor >= 1.5 ? 'var(--green)' : profitFactor >= 1 ? 'var(--amber)' : 'var(--red)' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card">
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Filters + header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={15} color="var(--text-muted)" />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>CLOSED TRADES</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <DateFilterBar filter={dateFilter} onChange={setDateFilter} />
            <button onClick={loadOrders} className="btn btn-secondary" style={{ padding: '6px 10px' }}>
              <RefreshCw size={12} />
            </button>
          </div>
        </div>

        {/* Trade list */}
        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading trades...</div>
        ) : trades.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
            No closed trades found for this period.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {trades.map(trade => {
              const note       = notes[trade.key];
              const isWin      = trade.pnl >= 0;
              const isExpanded = expandedKey === trade.key;
              const isEditing  = editingKey  === trade.key;
              const isOption   = trade.assetType === 'OPTION' || isOptionSymbol(trade.symbol);

              return (
                <div key={trade.key} className="card fade-in"
                  style={{ borderLeft: `3px solid ${isWin ? 'var(--green)' : 'var(--red)'}`, padding: 0, overflow: 'hidden' }}
                >
                  {/* Main row */}
                  <div onClick={() => setExpandedKey(isExpanded ? null : trade.key)}
                    style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', gap: 12 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Symbol */}
                    <div style={{ minWidth: 160 }}>
                      <SymbolDisplay symbol={trade.symbol} assetType={trade.assetType} />
                      <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: trade.side === 'LONG' ? 'var(--green)' : 'var(--red)' }}>{trade.side}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{trade.date}</span>
                      </div>
                    </div>

                    {/* Entry → Exit */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 16 }}>
                      {[
                        { label: 'ENTRY', price: trade.entryPrice, time: trade.entryTime },
                        { label: 'EXIT',  price: trade.exitPrice,  time: trade.exitTime  },
                      ].map(({ label, price, time }) => (
                        <div key={label} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
                          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600 }}>${price.toFixed(2)}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {time ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                          </div>
                        </div>
                      ))}

                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>{isOption ? 'CONTRACTS' : 'SHARES'}</div>
                        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>{trade.qty}</div>
                      </div>

                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>DURATION</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{duration(trade.entryTime, trade.exitTime)}</div>
                      </div>

                      {isOption && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>MULTIPLIER</div>
                          <div style={{ fontSize: 11, color: 'var(--accent)' }}>×100</div>
                        </div>
                      )}
                    </div>

                    {/* Setup + rating */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {note?.setup && <span className="badge badge-blue" style={{ fontSize: 10 }}>{note.setup}</span>}
                      {note?.rating > 0 && <span style={{ fontSize: 12, color: 'var(--amber)' }}>{'★'.repeat(note.rating)}</span>}
                    </div>

                    {/* P&L */}
                    <div style={{ textAlign: 'right', minWidth: 100 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', color: isWin ? 'var(--green)' : 'var(--red)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 16 }}>
                        {isWin ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {isWin ? '+' : ''}${trade.pnl.toFixed(2)}
                      </div>
                      {isOption && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right' }}>
                          (${((trade.exitPrice - trade.entryPrice) * trade.qty).toFixed(2)} raw)
                        </div>
                      )}
                    </div>

                    <div style={{ color: 'var(--text-muted)' }}>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </div>

                  {/* Expanded */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px', background: 'var(--bg-secondary)' }}>
                      {!isEditing && note && (
                        <div style={{ marginBottom: 12 }}>
                          {note.setup && <div style={{ marginBottom: 6 }}><span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>SETUP: </span><span className="badge badge-blue">{note.setup}</span></div>}
                          {note.notes && <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: 6, lineHeight: 1.5 }}>"{note.notes}"</div>}
                          {note.tags?.length > 0 && (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                              {note.tags.map(tag => <span key={tag} className="badge badge-amber" style={{ fontSize: 10 }}>{tag}</span>)}
                            </div>
                          )}
                          {note.rating > 0 && <div style={{ fontSize: 14, color: 'var(--amber)' }}>{'★'.repeat(note.rating)}{'☆'.repeat(5 - note.rating)}</div>}
                        </div>
                      )}

                      {isEditing ? (
                        <div>
                          <div style={{ marginBottom: 12 }}>
                            <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: '0.05em' }}>SETUP</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {SETUPS.map(s => (
                                <button key={s} onClick={() => setEditForm(prev => ({ ...prev, setup: s }))}
                                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 11, fontWeight: 500, transition: 'all 0.15s',
                                    background: editForm.setup === s ? 'var(--accent)' : 'var(--bg-tertiary)',
                                    color: editForm.setup === s ? 'white' : 'var(--text-secondary)' }}
                                >{s}</button>
                              ))}
                            </div>
                          </div>
                          <div style={{ marginBottom: 12 }}>
                            <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: '0.05em' }}>NOTES</label>
                            <textarea value={editForm.notes} onChange={e => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                              placeholder="What happened? Why did you enter? What did you learn?"
                              style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', minHeight: 80, outline: 'none' }}
                            />
                          </div>
                          <div style={{ marginBottom: 12 }}>
                            <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: '0.05em' }}>TAGS</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {TRADE_TAGS.map(tag => (
                                <button key={tag} onClick={() => toggleTag(tag)}
                                  style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${editForm.tags.includes(tag) ? 'var(--amber)' : 'var(--border)'}`, cursor: 'pointer', fontSize: 11, fontWeight: 500, transition: 'all 0.15s',
                                    background: editForm.tags.includes(tag) ? 'var(--amber-bg)' : 'var(--bg-tertiary)',
                                    color: editForm.tags.includes(tag) ? 'var(--amber)' : 'var(--text-secondary)' }}
                                >{tag}</button>
                              ))}
                            </div>
                          </div>
                          <div style={{ marginBottom: 14 }}>
                            <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: '0.05em' }}>TRADE RATING</label>
                            <StarRating value={editForm.rating} onChange={r => setEditForm(prev => ({ ...prev, rating: r }))} />
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => saveNote(trade.key)} className="btn btn-primary" style={{ fontSize: 12 }}>Save</button>
                            <button onClick={() => setEditingKey(null)} className="btn btn-secondary" style={{ fontSize: 12 }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(trade.key)} className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }}>
                          <Plus size={12} /> {note ? 'Edit Note & Setup' : 'Add Note & Setup'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
