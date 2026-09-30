import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { authApi } from '../api/endpoints';

const AuthContext = createContext(null);

const TOKEN_KEY = 'pd_token';
const USER_KEY = 'pd_user';

function loadUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeUser(user) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* storage unavailable - keep the in-memory copy only */
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadUser);

  const login = useCallback(async (username, password) => {
    const res = await authApi.login(username, password);
    localStorage.setItem(TOKEN_KEY, res.data.token);
    storeUser(res.data.user);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  // Permissions are cached at login. Re-read them whenever the app loads so a
  // change an admin makes to a role reaches signed-in users without a new login.
  // A 401 here (deactivated or deleted account) is handled by the axios interceptor.
  const refreshUser = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY)) return null;
    try {
      const res = await authApi.me();
      const fresh = res.data?.user;
      if (fresh) {
        storeUser(fresh);
        setUser(fresh);
      }
      return fresh || null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // hasPermission('a.b') or hasPermission('a.b', 'c.d') / hasPermission(['a.b', 'c.d'])
  // is true when the account holds ANY of the given codes. No code at all means "open".
  const hasPermission = useCallback(
    (...codes) => {
      const perms = user?.permissions || [];
      const flat = codes.flat(Infinity).filter(Boolean);
      if (!flat.length) return true;
      return flat.some((code) => perms.includes(code));
    },
    [user]
  );

  // True when the account may only work with GST invoices (e.g. the Supervisor
  // role): it holds gst_invoices.* permissions but none of the full invoices.* ones.
  const gstOnly = useMemo(() => {
    const perms = user?.permissions || [];
    const hasGst = perms.some((code) => code.startsWith('gst_invoices.'));
    const hasFull = perms.some((code) => code.startsWith('invoices.'));
    return hasGst && !hasFull;
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser, hasPermission, gstOnly }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
