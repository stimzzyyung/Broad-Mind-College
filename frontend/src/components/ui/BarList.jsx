// Simple horizontal bars made with CSS (no chart library needed)
export default function BarList({ items, max, suffix = '' }) {
  const top = max || Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="bars">
      {items.map((item) => (
        <div key={item.label} className="bar-row">
          <span className="bar-label" title={item.label}>{item.label}</span>
          <div className="progress">
            <span style={{ width: `${Math.min((item.value / top) * 100, 100)}%` }} />
          </div>
          <span className="bar-value">{item.value}{suffix}</span>
        </div>
      ))}
    </div>
  );
}
