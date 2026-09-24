import { useEffect, useState } from 'react';
import { KeyRound, Save } from 'lucide-react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Loading, ErrorNote } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { initials, formatDate } from '../../utils/format.js';

// Used by all three portals. What you can see and edit depends on your role.
const LAYOUT = {
  student: {
    readonly: [
      ['School ID', 'schoolId'], ['Class', 'className'], ['Form teacher', 'formTeacherName'],
      ['Gender', 'gender'], ['Date of birth', 'dob'], ['Guardian', 'guardianName'], ['Guardian phone', 'guardianPhone'],
    ],
    editable: [['phone', 'Phone number'], ['address', 'Home address']],
  },
  teacher: {
    readonly: [['Staff ID', 'schoolId'], ['Email', 'email'], ['Subjects', 'subjects'], ['Classes', 'classes']],
    editable: [['name', 'Full name'], ['phone', 'Phone number'], ['qualification', 'Qualification'], ['address', 'Address'], ['bio', 'About you']],
  },
  admin: {
    readonly: [['Staff ID', 'schoolId'], ['Email', 'email']],
    editable: [['name', 'Full name'], ['phone', 'Phone number'], ['address', 'Address'], ['bio', 'About you']],
  },
  parent: {
    readonly: [['Email', 'email'], ['Children', 'children']],
    editable: [['name', 'Full name'], ['phone', 'Phone number'], ['address', 'Address']],
  },
};
const roleName = { student: 'Student', teacher: 'Teacher', admin: 'Principal', parent: 'Parent' };

export default function Profile() {
  const { updateUser } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useFetch('/profile');
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwError, setPwError] = useState('');

  // Fill the form once the profile arrives
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return null;

  const layout = LAYOUT[data.role];
  const show = (value) => (Array.isArray(value) ? value.join(', ') || 'None yet' : value || 'Not set');

  async function saveProfile(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {};
      layout.editable.forEach(([key]) => { body[key] = form[key] || ''; });
      const updated = await api.put('/profile', body);
      updateUser({ name: updated.name });
      toast.success('Profile saved');
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwError('');
    if (pw.newPassword !== pw.confirm) return setPwError('The new passwords do not match');
    try {
      await api.post('/auth/change-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      toast.success('Password changed');
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setPwError(err.message);
    }
  }

  return (
    <>
      <PageHeader title="Profile" subtitle="Your details and account security." />

      <div className="card row" style={{ gap: 18, marginBottom: 18 }}>
        <div className="avatar avatar-lg">{initials(data.name)}</div>
        <div>
          <h2 style={{ fontSize: 24 }}>{data.name}</h2>
          <div className="row" style={{ marginTop: 6 }}>
            <Badge tone="info">{roleName[data.role]}</Badge>
            <span className="muted small">Joined {formatDate(data.createdAt)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-head"><h3>Your details</h3></div>
          <dl className="kv">
            {layout.readonly.map(([label, key]) => (
              <div key={key} style={{ display: 'contents' }}>
                <dt>{label}</dt>
                <dd>{show(data[key])}</dd>
              </div>
            ))}
          </dl>
        </div>

        <form className="card" onSubmit={saveProfile}>
          <div className="card-head"><h3>Update contact details</h3></div>
          <div className="form-grid">
            {layout.editable.map(([key, label]) => (
              <div key={key} className={`field ${key === 'bio' || key === 'address' ? 'full' : ''}`}>
                <label htmlFor={`f-${key}`}>{label}</label>
                {key === 'bio' ? (
                  <textarea id={`f-${key}`} className="textarea" value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                ) : (
                  <input id={`f-${key}`} className="input" value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                )}
              </div>
            ))}
          </div>
          {data.role === 'student' && <p className="hint" style={{ marginTop: 12 }}>To change your name or class, ask the school office.</p>}
          <div className="form-actions">
            <button className="btn btn-primary" disabled={saving}><Save size={17} />{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </form>
      </div>

      <form className="card mt" onSubmit={changePassword} style={{ maxWidth: 560 }}>
        <div className="card-head"><h3>Change password</h3></div>
        <div className="stack" style={{ gap: 14 }}>
          <div className="field">
            <label htmlFor="cur">Current password</label>
            <input id="cur" type="password" className="input" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="new">New password</label>
              <input id="new" type="password" className="input" autoComplete="new-password" minLength={6} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor="conf">Confirm new password</label>
              <input id="conf" type="password" className="input" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required />
            </div>
          </div>
          {pwError && <div className="error-note" role="alert">{pwError}</div>}
        </div>
        <div className="form-actions">
          <button className="btn btn-outline"><KeyRound size={17} />Change password</button>
        </div>
      </form>
    </>
  );
}
