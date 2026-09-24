import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { timeAgo } from '../../utils/format.js';

const POLL_MS = 20000;

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState(null); // null until first opened/loaded
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);

  async function pollCount() {
    try {
      const res = await api.get('/notifications/unread-count');
      setCount(res.count);
    } catch {
      // quietly ignore — notifications are a nice-to-have, not critical
    }
  }

  useEffect(() => {
    pollCount();
    const t = setInterval(pollCount, POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadList() {
    setLoading(true);
    try {
      const res = await api.get('/notifications');
      setItems(res);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  }

  async function openItem(n) {
    setOpen(false);
    if (!n.read) {
      setItems((list) => list.map((i) => (i.id === n.id ? { ...i, read: true } : i)));
      setCount((c) => Math.max(0, c - 1));
      api.post(`/notifications/${n.id}/read`).catch(() => {});
    }
    navigate(`/${user.role}${n.link || ''}`);
  }

  async function markAllRead() {
    setItems((list) => (list ? list.map((i) => ({ ...i, read: true })) : list));
    setCount(0);
    try {
      await api.post('/notifications/read-all');
    } catch {
      // ignore
    }
  }

  return (
    <div className="notif-wrap" ref={panelRef}>
      <button className="icon-btn" onClick={toggle} aria-label={`Notifications${count ? `, ${count} unread` : ''}`} aria-expanded={open}>
        <Bell size={20} />
        {count > 0 && <span className="notif-badge">{count > 9 ? '9+' : count}</span>}
      </button>

      {open && (
        <>
          <div className="notif-scrim" onClick={() => setOpen(false)} />
          <div className="notif-panel" role="dialog" aria-label="Notifications">
            <div className="notif-panel-head">
              <h4>Notifications</h4>
              {items && items.some((i) => !i.read) && (
                <button className="btn btn-ghost btn-sm" onClick={markAllRead}><CheckCheck size={15} />Mark all read</button>
              )}
            </div>
            {loading || !items ? (
              <div style={{ padding: 24, textAlign: 'center' }} className="muted small">Loading…</div>
            ) : items.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center' }} className="muted small">You're all caught up.</div>
            ) : (
              items.map((n) => (
                <button key={n.id} className={`notif-item ${!n.read ? 'unread' : ''}`} onClick={() => openItem(n)}>
                  <span className={`notif-dot ${n.read ? 'read' : ''}`} />
                  <div className="grow">
                    <div className="title">{n.title}</div>
                    <div className="sub">{n.body}</div>
                    <div className="when">{timeAgo(n.createdAt)}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
