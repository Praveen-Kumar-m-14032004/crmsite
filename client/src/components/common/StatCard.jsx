export default function StatCard({ label, value, gradient, icon: Icon, loading }) {
  return (
    <div className="stat-card" style={{ background: gradient }}>
      <span className="stat-icon">{Icon ? <Icon /> : null}</span>
      <div>
        <div className="stat-value">
          {loading ? <span className="skeleton" style={{ display: 'block', width: 70, height: 26, background: 'rgba(255,255,255,.3)' }} /> : value}
        </div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}
