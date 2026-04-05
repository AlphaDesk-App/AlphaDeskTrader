import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Zap, Mail, Lock, User, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const requirements = [
  { test: (p: string) => p.length >= 8,   label: 'At least 8 characters' },
  { test: (p: string) => /[A-Z]/.test(p), label: 'One uppercase letter'  },
  { test: (p: string) => /[0-9]/.test(p), label: 'One number'            },
];

export default function Register() {
  const { register }              = useAuth();
  const navigate                  = useNavigate();
  const [fullName, setFullName]   = useState('');
  const [email, setEmail]         = useState('');
  const [pass, setPass]           = useState('');
  const [show, setShow]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (requirements.some(r => !r.test(pass))) {
      setError('Password does not meet all requirements');
      return;
    }
    setLoading(true);
    try {
      await register(email, pass, fullName);
      // Always go to connect Schwab after registration
      navigate('/connect-schwab');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 24px' }}>

        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, background: 'var(--accent)', borderRadius: 14, marginBottom: 16 }}>
            <Zap size={28} color="white" fill="white" />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>
            Alpha<span style={{ color: 'var(--accent)' }}>Desk</span>
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Professional Trading Platform</p>
        </div>

        <div className="card" style={{ padding: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Create your account</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>Start trading smarter with AlphaDesk</p>

          {error && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 13, color: 'var(--red)' }}>
              <AlertCircle size={14} />{error}
            </div>
          )}

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Full Name</label>
              <div style={{ position: 'relative' }}>
                <User size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required
                  placeholder="Justin Smith" style={{ width: '100%', paddingLeft: 34 }} />
              </div>
            </div>

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
              {pass && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {requirements.map(r => (
                    <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                      <CheckCircle size={11} color={r.test(pass) ? 'var(--green)' : 'var(--border)'} />
                      <span style={{ color: r.test(pass) ? 'var(--green)' : 'var(--text-muted)' }}>{r.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: '11px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 14, background: 'var(--accent)', color: 'white', opacity: loading ? 0.7 : 1, marginTop: 6, transition: 'all 0.15s' }}>
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          {/* Progress steps */}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 10, textAlign: 'center' }}>ACCOUNT SETUP STEPS</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
              {[
                { label: '1. Create account', done: true  },
                { label: '→', done: false, arrow: true    },
                { label: '2. Connect Schwab', done: false },
                { label: '→', done: false, arrow: true    },
                { label: '3. Start trading',  done: false },
              ].map((s, i) => (
                s.arrow
                  ? <span key={i} style={{ fontSize: 12, color: 'var(--border)' }}>→</span>
                  : <span key={i} style={{ fontSize: 11, fontWeight: 500, color: s.done ? 'var(--green)' : 'var(--text-muted)' }}>{s.label}</span>
              ))}
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
