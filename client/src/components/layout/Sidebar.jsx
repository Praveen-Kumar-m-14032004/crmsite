import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/AuthContext';
import {
  BrandLockup, ChevronRight, CustomersIcon, DashboardIcon, InvoiceIcon,
  ProductsIcon, QuotationIcon, ReportsIcon, SettingsIcon, TrashIcon, UsersIcon,
} from '../common/Icons';

// `permission` may be a single code or a list; the item shows when the account
// holds ANY of them. `gstLabel` is used instead of `label` for GST-only accounts.
const MENU = [
  { type: 'label', label: 'Home' },
  { type: 'link', label: 'Dashboard', to: '/dashboard', permission: 'dashboard.view', icon: DashboardIcon },
  {
    type: 'group', label: 'Customer Details', permission: 'customers.view', icon: CustomersIcon,
    children: [
      { label: 'Add Customer', to: '/customers/add', permission: 'customers.create' },
      { label: 'Manage Customer', to: '/customers', permission: 'customers.view' },
    ],
  },
  {
    type: 'group', label: 'Product Name', permission: 'products.view', icon: ProductsIcon,
    children: [
      { label: 'Add product', to: '/products/add', permission: 'products.create' },
      { label: 'Manage product', to: '/products', permission: 'products.view' },
    ],
  },
  {
    type: 'group', label: 'Invoice', gstLabel: 'GST Invoice', permission: ['invoices.view', 'gst_invoices.view'], icon: InvoiceIcon,
    children: [
      { label: 'Add Invoice', gstLabel: 'Add GST Invoice', to: '/invoices/add', permission: ['invoices.create', 'gst_invoices.create'] },
      { label: 'Manage Invoice', gstLabel: 'Manage GST Invoices', to: '/invoices', permission: ['invoices.view', 'gst_invoices.view'] },
    ],
  },
  {
    type: 'group', label: 'Quotation', permission: 'quotations.view', icon: QuotationIcon,
    children: [
      { label: 'Add Quotation', to: '/estimates/add', permission: 'quotations.create' },
      { label: 'Manage Quotation', to: '/estimates', permission: 'quotations.view' },
    ],
  },
  { type: 'link', label: 'Reports', to: '/reports', permission: 'reports.view', icon: ReportsIcon },
  { type: 'link', label: 'Trash', to: '/invoices/trash', permission: ['invoices.delete', 'gst_invoices.delete'], icon: TrashIcon },
  { type: 'label', label: 'Administration', permission: ['users.manage', 'roles.manage', 'settings.manage'] },
  {
    type: 'group', label: 'User Management', permission: ['users.manage', 'roles.manage'], icon: UsersIcon,
    children: [
      { label: 'Add User', to: '/users/add', permission: 'users.manage' },
      { label: 'Manage Users', to: '/users', permission: 'users.manage' },
      { label: 'Roles & Permissions', to: '/roles', permission: 'roles.manage' },
    ],
  },
  { type: 'link', label: 'Company Settings', to: '/settings', permission: 'settings.manage', icon: SettingsIcon },
];

function groupIsOpen(item, pathname) {
  return item.children.some((c) => pathname === c.to || pathname.startsWith(`${c.to}/`));
}

export default function Sidebar({ collapsed, onNavigate }) {
  const { hasPermission, gstOnly } = useAuth();
  const { pathname } = useLocation();

  const text = (item) => (gstOnly && item.gstLabel) || item.label;

  const [openGroups, setOpenGroups] = useState(() => {
    const initial = {};
    MENU.forEach((item) => {
      if (item.type === 'group' && groupIsOpen(item, pathname)) initial[item.label] = true;
    });
    return initial;
  });

  // Keep the group containing the active route expanded when navigating.
  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      MENU.forEach((item) => {
        if (item.type === 'group' && groupIsOpen(item, pathname)) next[item.label] = true;
      });
      return next;
    });
  }, [pathname]);

  const toggleGroup = (label) => setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-brand">
        <BrandLockup onDark width={160} />
      </div>

      {MENU.map((item) => {
        if (!hasPermission(item.permission)) return null;

        if (item.type === 'label') {
          return <div key={item.label} className="sidebar-section-label">{item.label}</div>;
        }

        if (item.type === 'link') {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
            >
              <Icon />
              <span className="label">{text(item)}</span>
            </NavLink>
          );
        }

        const visibleChildren = item.children.filter((c) => hasPermission(c.permission));
        if (!visibleChildren.length) return null;

        const isOpen = Boolean(openGroups[item.label]);
        const isCurrent = groupIsOpen(item, pathname);
        const Icon = item.icon;

        return (
          <div key={item.label}>
            <div
              className={`sidebar-item ${isCurrent && !isOpen ? 'active' : ''}`}
              onClick={() => toggleGroup(item.label)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleGroup(item.label)}
            >
              <Icon />
              <span className="label">{text(item)}</span>
              <ChevronRight className={`sidebar-chevron ${isOpen ? 'open' : ''}`} />
            </div>

            <div className={`sidebar-submenu ${isOpen ? 'open' : ''}`}>
              <div>
                {visibleChildren.map((child) => (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    end
                    onClick={onNavigate}
                    className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
                  >
                    <span className="label">{text(child)}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      <div className="sidebar-footer">Permit Declaration</div>
    </aside>
  );
}
