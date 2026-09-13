import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/AuthContext';
import { useClock } from '../../hooks/useClock';
import { BrandLockup, LogoutIcon, MenuIcon } from '../common/Icons';

export default function TopBar({ onToggleSidebar, showBrand }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const now = useClock();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onClickAway = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, [menuOpen]);

  const initials = (user?.name || user?.username || '?')
    .split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="hamburger" onClick={onToggleSidebar} aria-label="Toggle sidebar">
          <MenuIcon />
        </button>
        {/* Only when the sidebar is hidden - otherwise the brand shows twice. */}
        {showBrand && (
          <div style={{ color: 'var(--purple-700)' }}>
            <BrandLockup tileSize={34} />
          </div>
        )}
      </div>

      <div className="topbar-clock">{now.toString()}</div>

      <div className="topbar-right" ref={menuRef}>
        <button className="avatar-btn" onClick={() => setMenuOpen((o) => !o)}>
          <span className="avatar-meta">
            <strong>{user?.name || user?.username}</strong>
            <span>{user?.roleName}</span>
          </span>
          <span className="avatar">{initials}</span>
        </button>

        {menuOpen && (
          <div className="user-menu">
            <div className="user-info">
              <span className="avatar" style={{ width: 38, height: 38, fontSize: 14 }}>{initials}</span>
              <div style={{ minWidth: 0 }}>
                <strong>{user?.name || user?.username}</strong>
                <span>{user?.email || user?.roleName}</span>
              </div>
            </div>
            <button className="menu-action" onClick={handleLogout}>
              <LogoutIcon width={15} height={15} /> Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
