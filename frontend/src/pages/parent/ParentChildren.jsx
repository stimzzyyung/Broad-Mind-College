import { useState } from 'react';
import { Copy, Check, UserPlus, Baby } from 'lucide-react';
import { api } from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { Loading, ErrorNote, EmptyState } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';

const EMPTY = { firstName: '', lastName: '', gender: '', dob: '', classId: '', address: '' };

export default function ParentChildren() {
  const toast = useToast();
  const children = useFetch('/students');
  const classes = useFetch('/classes');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);

  if (children.loading || classes.loading) return <Loading />;
  if (children.error || classes.error) {
    return <ErrorNote message={children.error || classes.error} onRetry={() => { children.reload(); classes.reload(); }} />;
  }

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await api.post('/students', form);
      setCreated(result);
      setForm(EMPTY);
      setOpen(false);
      toast.success(`${result.student.name} has been registered`);
      children.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyLogin() {
    const text = `${created.student.name}\nLogin ID: ${created.credentials.loginId}\nPassword: ${created.credentials.password}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <PageHeader
        title="My children"
        subtitle="Register a child to enrol them at the school and get their student login."
        actions={<button className="btn btn-primary" onClick={() => setOpen(true)}><UserPlus size={17} />Register a child</button>}
      />

      {created && (
        <div className="success-panel" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 18 }}>{created.student.name} is now in {created.student.className}</h3>
          <p className="muted" style={{ margin: '6px 0 12px' }}>
            Your child can sign in to the student portal with these details. They can change the password afterwards.
          </p>
          <div className="row" style={{ gap: 24, marginBottom: 14 }}>
            <div><div className="small muted">Login ID</div><div className="strong" style={{ fontSize: 18 }}>{created.credentials.loginId}</div></div>
            <div><div className="small muted">First password</div><div className="strong" style={{ fontSize: 18 }}>{created.credentials.password}</div></div>
          </div>
          <div className="row">
            <button className="btn btn-outline btn-sm" onClick={copyLogin}>
              {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'Copy login details'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setCreated(null)}>Dismiss</button>
          </div>
        </div>
      )}

      <div className="card card-flush">
        <div className="card-head"><h3>Registered children ({children.data.length})</h3></div>
        {children.data.length === 0 ? (
          <EmptyState
            icon={Baby} title="No children registered yet"
            text="Use the button above to enrol your child and get their student login details."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>School ID</th><th>Class</th><th>Gender</th></tr></thead>
              <tbody>
                {children.data.map((c) => (
                  <tr key={c.id}>
                    <td className="strong">{c.name}</td>
                    <td>{c.schoolId}</td>
                    <td>{c.className}</td>
                    <td>{c.gender}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && (
        <Modal title="Register a child" onClose={() => setOpen(false)} wide>
          <form onSubmit={handleSubmit} className="stack" style={{ gap: 14 }}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="p-first">First name</label>
                <input id="p-first" className="input" value={form.firstName} onChange={set('firstName')} required />
              </div>
              <div className="field">
                <label htmlFor="p-last">Last name</label>
                <input id="p-last" className="input" value={form.lastName} onChange={set('lastName')} required />
              </div>
              <div className="field">
                <label htmlFor="p-gender">Gender</label>
                <select id="p-gender" className="select" value={form.gender} onChange={set('gender')} required>
                  <option value="">Choose…</option>
                  <option>Female</option>
                  <option>Male</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="p-dob">Date of birth</label>
                <input id="p-dob" type="date" className="input" value={form.dob} onChange={set('dob')} required />
              </div>
              <div className="field">
                <label htmlFor="p-class">Class</label>
                <select id="p-class" className="select" value={form.classId} onChange={set('classId')} required>
                  <option value="">Choose a class…</option>
                  {classes.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="p-address">Home address</label>
                <input id="p-address" className="input" value={form.address} onChange={set('address')} />
              </div>
            </div>
            <p className="hint">Your name and phone number, from your profile, will be used as the guardian contact.</p>
            {error && <div className="error-note" role="alert">{error}</div>}
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy}><UserPlus size={17} />{busy ? 'Registering…' : 'Register child'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
