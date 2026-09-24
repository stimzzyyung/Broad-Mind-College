import { useLocation } from 'react-router-dom';
import { CalendarDays, Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { titleFor } from '../../config/navigation.js';
import { initials } from '../../utils/format.js';
import NotificationBell from './NotificationBell.jsx';

export default function Topbar({ onMenu }) {
  const { user, settings } = useAuth();
  const { pathname } = useLocation();

  return (
    <header className="topbar">
      <button className="icon-btn menu-btn" onClick={onMenu} aria-label="Open menu">
        <Menu size={22} />
      </button>
      <div className="topbar-title">{titleFor(user.role, pathname)}</div>
      <div className="topbar-spacer" />
      <div className="term-pill">
        <CalendarDays size={15} />
        <span>{settings.term}, {settings.session}</span>
      </div>
      <NotificationBell />
      <div className="avatar avatar-sm" title={user.name}>{initials(user.name)}</div>
    </header>
  );
}
