import { useState } from 'react';
import Header from '../components/Header';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon, Shield, Bell, Database, Keyboard } from 'lucide-react';

interface ToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
}

function Toggle({ value, onChange }: ToggleProps) {
  return (
    <div onClick={() => onChange(!value)}
      style={{ width: 36, height: 20, borderRadius: 10, background: value ? 'var(--green)' : 'var(--border)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}
    >
      <div style={{ width: 16, height: 16, borderRadius: 8, background: 'white', position: 'absolute', top: 2, left: value ? 18 : 2, transition: 'left 0.2s' }} />
    </div>
  );
}

function usePersistedToggle(key: string, defaultValue: boolean) {
  const [value, setValue] = useState<boolean>(() => {
    const saved = localStorage.getItem(key);
    return saved !== null ? JSON.parse(saved) : defaultValue;
  });
  const set = (v: boolean) => {
    setValue(v);
    localStorage.setItem(key, JSON.stringify(v));
  };
  return [value, set] as const;
}

const kbdStyle: React.CSSProperties = {
  background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
  borderRadius: 5, padding: '2px 8px', fontFamily: 'JetBrains Mono, monospace',
  fontSize: 11, fontWeight: 600, color: 'var(--text-primary)',
};

export default function Settings() {
  const { theme, toggleTheme } = useTheme();

  const [confirmOrders,  setConfirmOrders]  = usePersistedToggle('ad_confirm_orders', true);
  const [maxSizeWarn,    setMaxSizeWarn]    = usePersistedToggle('ad_max_size_warn', true);
  const [lossLimitAlert, setLossLimitAlert] = usePersistedToggle('ad_loss_limit', false);
  const [notifyFills,    setNotifyFills]    = usePersistedToggle('ad_notify_fills', true);
  const [notifyAlerts,   setNotifyAlerts]   = usePersistedToggle('ad_notify_alerts', true);
  const [notifyMarket,   setNotifyMarket]   = usePersistedToggle('ad_notify_market', false);
  const [hotkeysEnabled, setHotkeysEnabled] = usePersistedToggle('ad_hotkeys', true);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header title="Settings" subtitle="Configure AlphaDesk" />
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Appearance */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Sun size={15} color="var(--accent)" />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Appearance</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Theme</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Currently: {theme === 'dark' ? 'Dark' : 'Light'}</div>
              </div>
              <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 8, padding: 3 }}>
                <button onClick={() => theme === 'light' && toggleTheme()}
                  style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500,
                    background: theme === 'dark' ? 'var(--bg-card)' : 'transparent',
                    color: theme === 'dark' ? 'var(--text-primary)' : 'var(--text-muted)', transition: 'all 0.15s' }}
                ><Moon size={13} /> Dark</button>
                <button onClick={() => theme === 'dark' && toggleTheme()}
                  style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500,
                    background: theme === 'light' ? 'var(--bg-card)' : 'transparent',
                    color: theme === 'light' ? 'var(--text-primary)' : 'var(--text-muted)', transition: 'all 0.15s' }}
                ><Sun size={13} /> Light</button>
              </div>
            </div>
          </div>

          {/* API Connection */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Database size={15} color="var(--accent)" />
              <span style={{ fontSize: 13, fontWeight: 600 }}>API Connection</span>
            </div>
            {[
              { label: 'Backend URL',  value: 'http://127.0.0.1:8000' },
              { label: 'WebSocket URL', value: 'ws://127.0.0.1:8000'  },
              { label: 'Schwab API',   value: 'api.schwabapi.com'      },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
                </div>
                <span className="badge badge-green">connected</span>
              </div>
            ))}
          </div>

          {/* Trading Safety */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Shield size={15} color="var(--amber)" />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Trading Safety</span>
            </div>
            <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--amber)', marginBottom: 4 }}>⚠️ Live Trading Mode</div>
              <div style={{ fontSize: 11, color: 'var(--amber)', lineHeight: 1.5 }}>
                Connected to your real Schwab account. All orders are real. No paper trading mode.
              </div>
            </div>

            {[
              { label: 'Require order confirmation', desc: 'Show confirmation before placing orders', value: confirmOrders, set: setConfirmOrders },
              { label: 'Max order size warning',     desc: 'Alert when order exceeds 100 shares',   value: maxSizeWarn,   set: setMaxSizeWarn   },
              { label: 'Daily loss limit alert',     desc: 'Warn when day P&L exceeds -$500',        value: lossLimitAlert, set: setLossLimitAlert },
            ].map(({ label, desc, value, set }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
                </div>
                <Toggle value={value} onChange={set} />
              </div>
            ))}
          </div>

          {/* Notifications */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Bell size={15} color="var(--accent)" />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Notifications</span>
            </div>
            {[
              { label: 'Order fills',       desc: 'Notify when orders are filled',          value: notifyFills,  set: setNotifyFills  },
              { label: 'Price alerts',      desc: 'Notify when watchlist hits price targets', value: notifyAlerts, set: setNotifyAlerts },
              { label: 'Market open/close', desc: 'Notify at 9:30 AM and 4:00 PM ET',       value: notifyMarket, set: setNotifyMarket },
            ].map(({ label, desc, value, set }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
                </div>
                <Toggle value={value} onChange={set} />
              </div>
            ))}
          </div>

          {/* Hotkeys */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Keyboard size={15} color="var(--accent)" />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Keyboard Shortcuts</span>
              </div>
              <Toggle value={hotkeysEnabled} onChange={setHotkeysEnabled} />
            </div>

            <div style={{ opacity: hotkeysEnabled ? 1 : 0.4, transition: 'opacity 0.2s' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10, letterSpacing: '0.05em' }}>NAVIGATION</div>
              {[
                { key: 'Alt + 1', action: 'Go to Dashboard'  },
                { key: 'Alt + 2', action: 'Go to Markets'    },
                { key: 'Alt + 3', action: 'Go to Charts'     },
                { key: 'Alt + 4', action: 'Go to Positions'  },
                { key: 'Alt + 5', action: 'Go to Orders'     },
                { key: 'Alt + 6', action: 'Go to Journal'    },
              ].map(({ key, action }) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{action}</span>
                  <kbd style={kbdStyle}>{key}</kbd>
                </div>
              ))}

              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, margin: '14px 0 10px', letterSpacing: '0.05em' }}>TRADING</div>
              {[
                { key: 'Alt + B',   action: 'Focus Buy order'    },
                { key: 'Alt + S',   action: 'Focus Sell order'   },
                { key: 'Alt + Esc', action: 'Cancel active order' },
              ].map(({ key, action }) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{action}</span>
                  <kbd style={kbdStyle}>{key}</kbd>
                </div>
              ))}
            </div>
          </div>

          <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-muted)', fontSize: 11 }}>
            AlphaDesk V2 · Built by Justin · Powered by Charles Schwab API
          </div>
        </div>
      </div>
    </div>
  );
}
