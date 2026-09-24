import { createContext, useContext, useState, useCallback } from 'react';
import { authApi } from '../api/endpoints';

const AuthContext = createContext(null);

function loadUser() {
  try {
    const raw = localStorage.getItem('pd_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadUser);

  const login = useCallback(async (username, password) => {
    const res = await authApi.login(username, password);
    localStorage.setItem('pd_token', res.data.token);
    localStorage.setItem('pd_user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('pd_token');
    localStorage.removeItem('pd_user');
    setUser(null);
  }, []);

  const hasPermission = useCallback(
    (...codes) => {
      const perms = user?.permissions || [];
      const flat = codes.flat(Infinity);
      if (!flat.length) return true;
      return flat.some((c) => {
        if (!c) return true;
        if (perms.includes(c)) return true;
        if (typeof c === 'string' && c.startsWith('quotations.')) {
          const fallback = c.replace('quotations.', 'invoices.');
          if (perms.includes(fallback)) return true;
        }
        return false;
      });
    },
    [user]
  );

  return (
    <AuthContext.Provider value={{ user, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
