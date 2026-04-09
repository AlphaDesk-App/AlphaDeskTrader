import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BarChart2, CandlestickChart, Briefcase, BookOpen, Settings, Zap } from 'lucide-react';

const navItems = [
  { to: '/',          icon: LayoutDashboard,  label: 'Dashboard'  },
  { to: '/markets',   icon: BarChart2,         label: 'Markets'    },
  { to: '/charts',    icon: CandlestickChart,  label: 'Charts'     },
  { to: '/positions', icon: Briefcase,         label: 'Positions'  },
  { to: '/journal',   icon: BookOpen,          label: 'Journal'    },
];

export default function Sidebar() {
  return (
    <aside style={{
      width: 'var(--sidebar-width)', background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border)', display: 'flex',
      flexDirection: 'column', height: '100vh', position: 'fixed',
      left: 0, top: 0, zIndex: 100,
    }}>
      <div style={{ height: 'var(--header-height)', display: 'flex', alignItems: 'center', padding: '0 20px', borderBottom: '1px solid var(--border)', gap: 10 }}>
        <div style={{ width: 28, height: 28, background: 'var(--accent)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Zap size={15} color="white" fill="white" />
        </div>
        <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em' }}>
          Alpha<span style={{ color: 'var(--accent)' }}>Desk</span>
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-muted)', padding: '2px 6px', borderRadius: 4 }}>V2</span>
      </div>

      <nav style={{ padding: '12px 10px', flex: 1 }}>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
              borderRadius: 8, marginBottom: 2, textDecoration: 'none', fontSize: 13,
              fontWeight: 500, color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              background: isActive ? 'var(--accent-muted)' : 'transparent', transition: 'all 0.15s',
            })}
          >
            <Icon size={16} />{label}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: '12px 10px', borderTop: '1px solid var(--border)' }}>
        <NavLink to="/settings"
          style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
            borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 500,
            color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
            background: isActive ? 'var(--accent-muted)' : 'transparent',
          })}
        >
          <Settings size={16} />Settings
        </NavLink>
      </div>
    </aside>
  );
}
