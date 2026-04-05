import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Zap, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login }             = useAuth();
  const navigate              = useNavigate();
  const [email, setEmail]     = useState('');
  const [pass, setPass]       = useState('');
  const [show, setShow]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, pass);
      // If Schwab not connected → force connect page
      if (!user.schwab_connected) {
        navigate('/connect-schwab');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '0 24px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, background: 'var(--accent)', borderRadius: 14, marginBottom: 16 }}>
            <Zap size={28} color="white" fill="white" />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>
            Alpha<span style={{ color: 'var(--accent)' }}>Desk</span>
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Professional Trading Platform</p>
        </div>

        <div className="card" style={{ padding: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Welcome back</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>Sign in to your AlphaDesk account</p>

          {error && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 13, color: 'var(--red)' }}>
              <AlertCircle size={14} />{error}
            </div>
          )}

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Email</label>
              <div style={{ position: 'relative' }}>
                <Mail size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="you@example.com" style={{ width: '100%', paddingLeft: 34 }} />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input type={show ? 'text' : 'password'} value={pass} onChange={e => setPass(e.target.value)} required
                  placeholder="••••••••" style={{ width: '100%', paddingLeft: 34, paddingRight: 36 }} />
                <button type="button" onClick={() => setShow(!show)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: '11px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 14, background: 'var(--accent)', color: 'white', opacity: loading ? 0.7 : 1, marginTop: 6, transition: 'all 0.15s' }}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-muted)' }}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>Create one</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
