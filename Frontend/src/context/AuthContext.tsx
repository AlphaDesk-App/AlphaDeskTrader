import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthUser {
  user_id: string;
  email: string;
  full_name: string;
  schwab_connected: boolean;
  token: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (email: string, password: string, fullName: string) => Promise<AuthUser>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);
const BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? '/api' : 'https://alphadesktrader.onrender.com';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('alphaDesk_token');
    if (token) {
      fetchMe(token).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const fetchMe = async (token: string): Promise<AuthUser | null> => {
    try {
      const res = await fetch(`${BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        localStorage.removeItem('alphaDesk_token');
        setUser(null);
        return null;
      }
      const data = await res.json();
      const u = { ...data, token };
      setUser(u);
      return u;
    } catch {
      localStorage.removeItem('alphaDesk_token');
      setUser(null);
      return null;
    }
  };

  const login = async (email: string, password: string): Promise<AuthUser> => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Login failed' }));
      throw new Error(err.detail || 'Login failed');
    }
    const data = await res.json();
    localStorage.setItem('alphaDesk_token', data.token);
    const u = { ...data };
    setUser(u);
    return u;
  };

  const register = async (email: string, password: string, fullName: string): Promise<AuthUser> => {
    const res = await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, full_name: fullName }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Registration failed' }));
      throw new Error(err.detail || 'Registration failed');
    }
    const data = await res.json();
    localStorage.setItem('alphaDesk_token', data.token);
    const u = { ...data };
    setUser(u);
    return u;
  };

  const logout = () => {
    localStorage.removeItem('alphaDesk_token');
    setUser(null);
  };

  const refreshUser = async () => {
    const token = localStorage.getItem('alphaDesk_token');
    if (token) await fetchMe(token);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
