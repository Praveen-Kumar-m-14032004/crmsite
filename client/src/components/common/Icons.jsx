import logoImg from '../../assets/logo.png';

const base = {
  width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
};

const s = (props) => ({ ...base, ...props });

/* ---- Brand ---- */
export function LogoMark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 12.5 9.5 18 20 6" />
    </svg>
  );
}

export function BrandLockup({ onDark = false, width = 180 }) {
  return (
    <div className={`brand-lockup${onDark ? ' on-dark' : ''}`}>
      <img
        src={logoImg}
        alt="Permit Declaration"
        style={{
          width: width,
          height: 'auto',
          display: 'block',
          borderRadius: onDark ? '6px' : '0',
          background: onDark ? '#ffffff' : 'transparent',
          padding: onDark ? '6px 10px' : '0',
        }}
      />
    </div>
  );
}

/* ---- Actions ---- */
export function EditIcon(p) {
  return (<svg {...s(p)}><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>);
}
export function TrashIcon(p) {
  return (<svg {...s(p)}><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>);
}
export function RestoreIcon(p) {
  return (<svg {...s(p)}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>);
}
export function PrinterIcon(p) {
  return (<svg {...s(p)}><path d="M6 9V2h12v7" /><rect x="4" y="9" width="16" height="8" rx="1.5" /><path d="M6 17v5h12v-5" /></svg>);
}
export function PlusIcon(p) {
  return (<svg {...s(p)}><path d="M12 5v14" /><path d="M5 12h14" /></svg>);
}
export function PlayIcon(p) {
  return (<svg {...s({ ...p, fill: 'currentColor', stroke: 'none' })}><path d="M8 5v14l11-7Z" /></svg>);
}
export function PauseIcon(p) {
  return (<svg {...s({ ...p, fill: 'currentColor', stroke: 'none' })}><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>);
}
export function SearchIcon(p) {
  return (<svg {...s({ width: 15, height: 15, ...p })}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>);
}
export function CloseIcon(p) {
  return (<svg {...s(p)}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>);
}
export function CheckIcon(p) {
  return (<svg {...s(p)}><polyline points="20 6 9 17 4 12" /></svg>);
}
export function AlertIcon(p) {
  return (<svg {...s(p)}><circle cx="12" cy="12" r="9" /><path d="M12 8v4.5" /><path d="M12 16h.01" /></svg>);
}
export function DownloadIcon(p) {
  return (<svg {...s(p)}><path d="M12 3v12" /><polyline points="7 10 12 15 17 10" /><path d="M4 21h16" /></svg>);
}
export function FilterIcon(p) {
  return (<svg {...s(p)}><path d="M3 5h18l-7 8v6l-4 2v-8Z" /></svg>);
}
export function LogoutIcon(p) {
  return (<svg {...s(p)}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><path d="M21 12H9" /></svg>);
}
export function MenuIcon(p) {
  return (<svg {...s({ width: 19, height: 19, ...p })}><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /></svg>);
}
export function ChevronRight(p) {
  return (<svg {...s({ width: 14, height: 14, strokeWidth: 2.4, ...p })}><polyline points="9 18 15 12 9 6" /></svg>);
}
export function SpinnerIcon(p) {
  return (<svg {...s({ ...p, strokeWidth: 2.6 })} className="spin"><path d="M21 12a9 9 0 1 1-6.2-8.6" /></svg>);
}

/* ---- Navigation ---- */
export function DashboardIcon(p) {
  return (<svg {...s({ width: 17, height: 17, ...p })}><rect x="3" y="3" width="7.5" height="8.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="5.5" rx="2" /><rect x="13.5" y="11" width="7.5" height="10" rx="2" /><rect x="3" y="14" width="7.5" height="7" rx="2" /></svg>);
}
export function CustomersIcon(p) {
  return (<svg {...s({ width: 17, height: 17, ...p })}><circle cx="9" cy="8" r="3.4" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16.5 5.2a3.4 3.4 0 0 1 0 6" /><path d="M18.5 20a6.5 6.5 0 0 0-3-5.4" /></svg>);
}
export function ProductsIcon(p) {
  return (<svg {...s({ width: 17, height: 17, ...p })}><path d="M21 8.5v7a2 2 0 0 1-1 1.7l-7 3.9a2 2 0 0 1-2 0l-7-3.9a2 2 0 0 1-1-1.7v-7a2 2 0 0 1 1-1.7l7-3.9a2 2 0 0 1 2 0l7 3.9a2 2 0 0 1 1 1.7Z" /><polyline points="3.3 7.5 12 12.3 20.7 7.5" /><path d="M12 12.3V21" /></svg>);
}
export function InvoiceIcon(p) {
  return (<svg {...s({ width: 17, height: 17, ...p })}><path d="M5 3.5h14v17l-2.3-1.6-2.4 1.6-2.3-1.6-2.4 1.6L7.3 19 5 20.5Z" /><path d="M9 8.5h6" /><path d="M9 12.5h6" /></svg>);
}
export function ReportsIcon(p) {
  return (<svg {...s({ width: 17, height: 17, ...p })}><path d="M3 20.5h18" /><rect x="4.5" y="11" width="4" height="8" rx="1.3" /><rect x="10" y="6.5" width="4" height="12.5" rx="1.3" /><rect x="15.5" y="3" width="4" height="16" rx="1.3" /></svg>);
}
export function UsersIcon(p) {
  return (<svg {...s({ width: 17, height: 17, ...p })}><circle cx="12" cy="7.5" r="3.6" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></svg>);
}
export function SettingsIcon(p) {
  return (<svg {...s({ width: 17, height: 17, ...p })}><circle cx="12" cy="12" r="3.2" /><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" /></svg>);
}

/* ---- Stat card glyphs ---- */
export function StatClientIcon(p) {
  return (<svg {...s({ width: 21, height: 21, strokeWidth: 1.9, ...p })}><circle cx="9" cy="8" r="3.4" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16.5 5.2a3.4 3.4 0 0 1 0 6" /><path d="M18.5 20a6.5 6.5 0 0 0-3-5.4" /></svg>);
}
export function StatBoxIcon(p) {
  return (<svg {...s({ width: 21, height: 21, strokeWidth: 1.9, ...p })}><path d="M21 8.5v7a2 2 0 0 1-1 1.7l-7 3.9a2 2 0 0 1-2 0l-7-3.9a2 2 0 0 1-1-1.7v-7a2 2 0 0 1 1-1.7l7-3.9a2 2 0 0 1 2 0l7 3.9a2 2 0 0 1 1 1.7Z" /><polyline points="3.3 7.5 12 12.3 20.7 7.5" /></svg>);
}
export function StatDocIcon(p) {
  return (<svg {...s({ width: 21, height: 21, strokeWidth: 1.9, ...p })}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><polyline points="14 3 14 8 19 8" /><path d="M9 13h6" /><path d="M9 17h4" /></svg>);
}
export function StatGstIcon(p) {
  return (<svg {...s({ width: 21, height: 21, strokeWidth: 1.9, ...p })}><rect x="4" y="3" width="16" height="18" rx="2.4" /><path d="M8.5 8.5h7" /><path d="M8.5 12.5h7" /><path d="M8.5 16.5h4" /></svg>);
}
export function StatRevenueIcon(p) {
  return (<svg {...s({ width: 21, height: 21, strokeWidth: 1.9, ...p })}><path d="M3 17.5 9 11l4 4 7.5-7.5" /><polyline points="15.5 7.5 20.5 7.5 20.5 12.5" /></svg>);
}
