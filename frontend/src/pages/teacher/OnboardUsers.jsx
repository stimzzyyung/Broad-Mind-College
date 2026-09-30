import { useState } from 'react';
import { Baby, Check, Copy, UserPlus, Users } from 'lucide-react';
import { api } from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Loading, ErrorNote } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';

const EMPTY_FORM = { name: '', email: '', phone: '', qualification: '', subjects: '' };

export default function OnboardUsers() {
  const toast = useToast();
  const students = useFetch('/students');
  const [role, setRole] = useState('teacher');
  const [form, setForm] = useState(EMPTY_FORM);
  const [studentIds, setStudentIds] = useState([]);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (students.loading) return <Loading />;
  if (students.error) return <ErrorNote message={students.error} onRetry={students.reload} />;
  const availableStudents = students.data.filter((student) => !student.parentId);

  function toggleStudent(id) {
    setStudentIds((selected) => selected.includes(id)
      ? selected.filter((selectedId) => selectedId !== id)
      : [...selected, id]);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (role === 'parent' && studentIds.length === 0) {
      setError('Select at least one student for this parent account');
      return;
    }

    setBusy(true);
    try {
      const payload = role === 'teacher'
        ? {
          ...form,
          subjects: form.subjects.split(',').map((subject) => subject.trim()).filter(Boolean),
        }
        : { name: form.name, email: form.email, phone: form.phone, studentIds };
      const result = await api.post(role === 'teacher' ? '/teachers' : '/parents', payload);
      setCreated({ name: result[role].name, ...result.credentials });
      setForm(EMPTY_FORM);
      setStudentIds([]);
      toast.success(`${result[role].name} has been onboarded`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyCredentials() {
    await navigator.clipboard.writeText(`${created.name}\nLogin ID: ${created.loginId}\nPassword: ${created.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <PageHeader title="Onboard staff and parents" subtitle="Create portal accounts and share the first-login details with each person." />

      <div className="tabs" role="tablist" aria-label="Account type">
        <button type="button" role="tab" aria-selected={role === 'teacher'} className={`tab ${role === 'teacher' ? 'active' : ''}`} onClick={() => { setRole('teacher'); setCreated(null); setError(''); }}>
          <Users size={15} style={{ verticalAlign: -3, marginRight: 6 }} />Teacher
        </button>
        <button type="button" role="tab" aria-selected={role === 'parent'} className={`tab ${role === 'parent' ? 'active' : ''}`} onClick={() => { setRole('parent'); setCreated(null); setError(''); }}>
          <Baby size={15} style={{ verticalAlign: -3, marginRight: 6 }} />Parent
        </button>
      </div>

      {created && (
        <div className="success-panel" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 18 }}>{created.name} has a new {role} account</h3>
          <p className="muted" style={{ margin: '6px 0 12px' }}>Share these first-login details with them. They can change their password from Profile.</p>
          <div className="row" style={{ gap: 24, marginBottom: 14 }}>
            <div><div className="small muted">Login ID</div><div className="strong">{created.loginId}</div></div>
            <div><div className="small muted">First password</div><div className="strong">{created.password}</div></div>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={copyCredentials}>
            {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'Copy login details'}
          </button>
        </div>
      )}

      <form className="stack" onSubmit={handleSubmit}>
        <div className="card">
          <div className="card-head"><h3>New {role} account</h3></div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="onboard-name">Full name</label>
              <input id="onboard-name" className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" required />
            </div>
            <div className="field">
              <label htmlFor="onboard-email">Email</label>
              <input id="onboard-email" type="email" className="input" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required />
            </div>
            <div className="field">
              <label htmlFor="onboard-phone">Phone number</label>
              <input id="onboard-phone" type="tel" className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} autoComplete="tel" />
            </div>
            {role === 'teacher' ? (
              <>
                <div className="field">
                  <label htmlFor="onboard-qualification">Qualification</label>
                  <input id="onboard-qualification" className="input" value={form.qualification} onChange={(event) => setForm({ ...form, qualification: event.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="onboard-subjects">Subjects</label>
                  <input id="onboard-subjects" className="input" value={form.subjects} onChange={(event) => setForm({ ...form, subjects: event.target.value })} placeholder="Separate subjects with commas" />
                </div>
              </>
            ) : (
              <fieldset className="field" style={{ gridColumn: '1 / -1', border: 0, padding: 0 }}>
                <legend className="strong" style={{ marginBottom: 8 }}>Link students to this parent</legend>
                {availableStudents.length === 0 ? (
                  <p className="muted small">There are no students in your classes to link.</p>
                ) : (
                  <div className="stack" style={{ gap: 8 }}>
                    {availableStudents.map((student) => (
                      <label key={student.id} className="row" style={{ justifyContent: 'flex-start', gap: 10 }}>
                        <input type="checkbox" checked={studentIds.includes(student.id)} onChange={() => toggleStudent(student.id)} />
                        <span>{student.name} <span className="muted small">({student.schoolId} · {student.className})</span></span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            )}
          </div>
          {error && <div className="error-note" role="alert" style={{ marginTop: 16 }}>{error}</div>}
          <div className="form-actions">
            <button className="btn btn-primary" disabled={busy || (role === 'parent' && availableStudents.length === 0)}>
              <UserPlus size={17} />{busy ? 'Creating account…' : `Create ${role} account`}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
