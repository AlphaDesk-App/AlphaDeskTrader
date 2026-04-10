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
import SchwabCallback from './pages/SchwabCallback';
import Dashboard from './pages/Dashboard';
import Markets from './pages/Markets';
import Charts from './pages/Charts';
import Positions from './pages/Positions';
import Journal from './pages/Journal';
import Settings from './pages/Settings';

const HOTKEY_ROUTES: Record<string, string> = {
  '1': '/', '2': '/markets', '3': '/charts',
  '4': '/positions', '5': '/journal',
};

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
            <HotkeyListener />
            <Routes>
              <Route path="/login"           element={<Login />} />
              <Route path="/register"        element={<Register />} />
              <Route path="/connect-schwab"  element={<ConnectSchwab />} />
              <Route path="/schwab-callback" element={<SchwabCallback />} />
              <Route element={<AuthGuard />}>
                <Route path="/" element={<Layout />}>
                  <Route index            element={<Dashboard />} />
                  <Route path="markets"   element={<Markets />} />
                  <Route path="charts"    element={<Charts />} />
                  <Route path="positions" element={<Positions />} />
                  <Route path="journal"   element={<Journal />} />
                  <Route path="settings"  element={<Settings />} />
                </Route>
              </Route>
            </Routes>
          </BrowserRouter>
        </AppProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
