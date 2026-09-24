export default function StatCard({ icon: Icon, label, value, hint, tone = 'primary', children }) {
  return (
    <div className="stat">
      <div className={`stat-icon tone-${tone}`}>
        <Icon size={20} />
      </div>
      <div className="stat-body">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {hint && <div className="stat-hint">{hint}</div>}
        {children}
      </div>
    </div>
  );
}
