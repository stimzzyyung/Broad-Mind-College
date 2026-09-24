import { Loader2, AlertCircle } from 'lucide-react';

export function Loading({ text = 'Loading…' }) {
  return (
    <div className="loading" role="status">
      <Loader2 size={20} className="spin" />
      <span>{text}</span>
    </div>
  );
}

export function ErrorNote({ message, onRetry }) {
  return (
    <div className="error-note" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
      {onRetry && (
        <button className="btn btn-outline btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="empty">
      {Icon && <Icon size={30} />}
      <h4>{title}</h4>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
