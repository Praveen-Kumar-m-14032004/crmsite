import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import Footer from './Footer';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => window.innerWidth <= 980);
  const { pathname } = useLocation();

  // On narrow screens the sidebar overlays the page - close it after navigating.
  useEffect(() => {
    if (window.innerWidth <= 980) setCollapsed(true);
  }, [pathname]);

  return (
    <div className="app-shell">
      <Sidebar collapsed={collapsed} onNavigate={() => { if (window.innerWidth <= 980) setCollapsed(true); }} />
      <div className="main-area">
        <TopBar showBrand={collapsed} onToggleSidebar={() => setCollapsed((c) => !c)} />
        <div className="content">
          <div className="page-enter" key={pathname}>
            <Outlet />
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
