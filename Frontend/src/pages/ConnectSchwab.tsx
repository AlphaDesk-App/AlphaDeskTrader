import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, ExternalLink, CheckCircle, AlertCircle, Link } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? '/api'
  : 'https://alphadesktrader.onrender.com';

export default function ConnectSchwab() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [authUrl, setAuthUrl] = useState('');
  const [pastedUrl, setPastedUrl] = useState('');
  const [status, setStatus] = useState<'idle'|'loading'|'success'|'error'>('idle');
  const [error, setError] = useState('');

  const getAuthUrl = async () => {
    setError('');
    try {
      const token = localStorage.getItem('alphaDesk_token') ?? '';
      const res = await fetch(`${API}/auth/schwab/connect`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to get auth URL');
      const data = await res.json();
      setAuthUrl(data.auth_url);
      window.open(data.auth_url, '_blank');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const submitUrl = async () => {
    if (!pastedUrl.trim()) { setError('Please paste the URL first'); return; }
    setStatus('loading');
    setError('');
    try {
      const url = new URL(pastedUrl.trim());
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state') ?? '';
      if (!code) throw new Error('No code found in URL. Copy the full address bar URL.');
      const token = localStorage.getItem('alphaDesk_token') ?? '';
      const res = await fetch(
        `${API}/auth/schwab/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed' }));
        throw new Error(err.detail);
      }
      await refreshUser();
      setStatus('success');
      setTimeout(() => navigate('/'), 1500);
    } catch (e: any) {
      setStatus('error');
      setError(e.message);
    }
  };

  if (status === 'success') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center' }}>
          <CheckCircle size={48} color="var(--green)" style={{ marginBottom: 16 }} />
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>Schwab Connected!</h2>
          <p style={{ color: 'var(--text-muted)' }}>Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
      <div style={{ width: '100%', maxWidth: 480, padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, background: 'var(--accent)', borderRadius: 14, marginBottom: 16 }}>
            <Zap size={28} color="white" fill="white" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Connect Schwab Account</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
            Hi {user?.full_name || user?.email?.split('@')[0]}
          </p>
        </div>

        <div className="card" style={{ padding: 32 }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 10 }}>STEP 1</div>
            <button onClick={getAuthUrl} style={{ width: '100%', padding: '11px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <ExternalLink size={15} /> Open Schwab Login
            </button>
            {authUrl && <p style={{ fontSize: 11, color: 'var(--green)', marginTop: 6 }}>✓ Schwab login opened in new tab</p>}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', marginBottom: 20 }} />

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 10 }}>STEP 2 — PASTE REDIRECT URL</div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
              After logging in you will see "This site can't be reached". Copy the full URL from the address bar and paste it below.
            </p>
            <input
              value={pastedUrl}
              onChange={e => setPastedUrl(e.target.value)}
              placeholder="https://127.0.0.1/?code=..."
              style={{ width: '100%', fontSize: 11, fontFamily: 'monospace' }}
            />
          </div>

          {error && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: 'var(--red)' }}>
              <AlertCircle size={13} />{error}
            </div>
          )}

          <button onClick={submitUrl} disabled={status === 'loading' || !pastedUrl.trim()}
            style={{ width: '100%', padding: '11px', borderRadius: 8, border: 'none', cursor: !pastedUrl.trim() ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 14,
              background: pastedUrl.trim() ? 'var(--green)' : 'var(--bg-tertiary)',
              color: pastedUrl.trim() ? 'white' : 'var(--text-muted)', opacity: status === 'loading' ? 0.7 : 1 }}>
            {status === 'loading' ? 'Connecting...' : 'Connect Schwab'}
          </button>

          <button onClick={() => navigate('/')} style={{ width: '100%', padding: '9px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
