import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import AuthGuard from './components/AuthGuard';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import ConnectSchwab from './pages/ConnectSchwab';
import Dashboard from './pages/Dashboard';
import Journal from './pages/Journal';
import Settings from './pages/Settings';

const HOTKEY_ROUTES: Record<string, string> = {
  '1': '/', '2': '/journal',
};

function SpaRedirectHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    const path = sessionStorage.getItem('__spa_path');
    if (path) {
      sessionStorage.removeItem('__spa_path');
      navigate(path, { replace: true });
    }
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function HotkeyListener() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (localStorage.getItem('ad_hotkeys') === 'false') return;
      if (HOTKEY_ROUTES[e.key]) { e.preventDefault(); navigate(HOTKEY_ROUTES[e.key]); return; }
      if (e.key === 'b' || e.key === 'B') { e.preventDefault(); document.querySelector<HTMLButtonElement>('[data-hotkey="buy"]')?.click(); }
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); document.querySelector<HTMLButtonElement>('[data-hotkey="sell"]')?.click(); }
      if (e.key === 'Escape')              { e.preventDefault(); document.querySelector<HTMLButtonElement>('[data-hotkey="cancel"]')?.click(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);
  return null;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppProvider>
          <BrowserRouter>
            <SpaRedirectHandler />
            <HotkeyListener />
            <Routes>
              <Route path="/login"          element={<Login />} />
              <Route path="/register"       element={<Register />} />
              <Route path="/connect-schwab" element={<ConnectSchwab />} />
              <Route element={<AuthGuard />}>
                <Route path="/" element={<Layout />}>
                  <Route index           element={<Dashboard />} />
                  <Route path="journal"  element={<Journal />} />
                  <Route path="settings" element={<Settings />} />
                </Route>
              </Route>
            </Routes>
          </BrowserRouter>
        </AppProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
