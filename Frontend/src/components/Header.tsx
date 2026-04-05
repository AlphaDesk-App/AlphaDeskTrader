import { Sun, Moon, Bell, LogOut, User } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

function getMarketStatus(): { label: string; color: string; bg: string } {
  const now = new Date();
  const et  = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  const t   = et.getHours() * 60 + et.getMinutes();
  const isWeekend = day === 0 || day === 6;
  if (isWeekend)               return { label: 'MARKET CLOSED', color: 'var(--text-muted)', bg: 'var(--bg-tertiary)' };
  if (t >= 570 && t < 960)     return { label: 'MARKET OPEN',   color: 'var(--green)',      bg: 'var(--green-bg)'    };
  if (t >= 240 && t < 570)     return { label: 'PRE-MARKET',    color: 'var(--amber)',      bg: 'var(--amber-bg)'    };
  if (t >= 960 && t < 1200)    return { label: 'AFTER HOURS',   color: 'var(--amber)',      bg: 'var(--amber-bg)'    };
  return { label: 'MARKET CLOSED', color: 'var(--text-muted)', bg: 'var(--bg-tertiary)' };
}

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { user, logout }       = useAuth();
  const market                 = getMarketStatus();

  return (
    <header style={{
      height: 'var(--header-height)', background: 'var(--bg-primary)',
      borderBottom: '1px solid var(--border)', display: 'flex',
      alignItems: 'center', padding: '0 24px', gap: 12,
      position: 'sticky', top: 0, zIndex: 50,
    }}>
      <div style={{ flex: 1 }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.2 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{subtitle}</p>}
      </div>

      {/* Live dot */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div className="live-dot" />
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>LIVE</span>
      </div>

      {/* Market status */}
      <div style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 5, background: market.bg, color: market.color }}>
        {market.label}
      </div>

      {/* Notifications */}
      <button style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px', cursor: 'pointer', display: 'flex', color: 'var(--text-secondary)' }}>
        <Bell size={15} />
      </button>

      {/* Theme toggle */}
      <button onClick={toggleTheme} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px', cursor: 'pointer', display: 'flex', color: 'var(--text-secondary)' }}>
        {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
      </button>

      {/* User info + logout */}
      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8, borderLeft: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={13} color="var(--accent)" />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>{user.full_name || user.email.split('@')[0]}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{user.schwab_connected ? '● Schwab connected' : '○ Schwab not connected'}</div>
            </div>
          </div>
          <button onClick={logout} title="Sign out"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px', cursor: 'pointer', display: 'flex', color: 'var(--text-secondary)' }}>
            <LogOut size={14} />
          </button>
        </div>
      )}
    </header>
  );
}
