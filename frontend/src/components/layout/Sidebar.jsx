import { NavLink, useNavigate } from 'react-router-dom';
import { LogOut, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { navigation, roleLabels } from '../../config/navigation.js';
import { initials } from '../../utils/format.js';

export default function Sidebar({ open, onClose }) {
  const { user, settings, logout } = useAuth();
  const navigate = useNavigate();
  const groups = navigation[user.role];

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
      {open && <div className="scrim" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-brand">
          <div className="crest">{settings.schoolName[0]}</div>
          <div>
            <div className="brand-name">{settings.schoolName}</div>
            <div className="brand-role">{roleLabels[user.role]}</div>
          </div>
          <button className="icon-btn sidebar-close" onClick={onClose} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <nav className="nav">
          {groups.map((group, index) => (
            <div className="nav-group" key={index}>
              {group.title && <div className="nav-group-title">{group.title}</div>}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <item.icon size={19} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="user-chip">
            <div className="avatar avatar-sm">{initials(user.name)}</div>
            <div className="user-text">
              <div className="user-name">{user.name}</div>
              <div className="user-id">{user.schoolId || user.email}</div>
            </div>
          </div>
          <button className="nav-item nav-logout" onClick={handleLogout}>
            <LogOut size={19} />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
