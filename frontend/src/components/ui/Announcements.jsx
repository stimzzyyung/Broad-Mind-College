import { Megaphone, Trash2 } from 'lucide-react';
import { formatDate } from '../../utils/format.js';
import { EmptyState } from './Feedback.jsx';

// The school notice board. Pass onDelete to show a delete button (principal only).
export default function Announcements({ items, onDelete }) {
  if (!items.length) {
    return <EmptyState icon={Megaphone} title="No notices yet" text="Notices from the principal appear here." />;
  }
  return (
    <div className="notices">
      {items.map((n) => (
        <article key={n.id} className="notice">
          <div className="row spread">
            <h4>{n.title}</h4>
            {onDelete && (
              <button className="icon-btn" onClick={() => onDelete(n.id)} aria-label={`Delete notice: ${n.title}`}>
                <Trash2 size={16} />
              </button>
            )}
          </div>
          <p>{n.body}</p>
          <span className="small muted">{n.author}, {formatDate(n.date)}</span>
        </article>
      ))}
    </div>
  );
}
