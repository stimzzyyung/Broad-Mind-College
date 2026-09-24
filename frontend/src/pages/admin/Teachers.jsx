import { useState } from 'react';
import { Plus, Trash2, Users, FileText } from 'lucide-react';
import { api } from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Loading, ErrorNote, EmptyState } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { SUBJECTS } from '../../utils/terms.js';

const EMPTY = { name: '', email: '', phone: '', qualification: '', subjects: [] };
const SAMPLE_CSV = `name,email,phone,qualification
Mrs. Grace Bello,grace.bello@crestview.edu,0803 111 2222,B.Sc Mathematics
Mr. Femi Alade,femi.alade@crestview.edu,0804 222 3333,`;

function parseTeacherRows(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length && /^name/i.test(lines[0])) lines.shift();
  return lines.map((line, i) => {
    const [name, email, phone, qualification] = line.split(',').map((c) => c.trim());
    return {
      line: i + 1, name, email, phone: phone || '', qualification: qualification || '',
      problem: !name || !email ? 'Name and email are required' : null,
    };
  });
}

export default function Teachers() {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch('/teachers');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [created, setCreated] = useState(null);
  const [formError, setFormError] = useState('');

  // ----- Bulk add -----
  const [bulkOpen, setBulkOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [rows, setRows] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  function toggleSubject(subject) {
    const has = form.subjects.includes(subject);
    setForm({ ...form, subjects: has ? form.subjects.filter((s) => s !== subject) : [...form.subjects, subject] });
  }

  async function addTeacher(e) {
    e.preventDefault();
    setFormError('');
    try {
      const result = await api.post('/teachers', form);
      setCreated(result);
      setForm(EMPTY);
      setOpen(false);
      reload();
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function remove(teacher) {
    if (!window.confirm(`Remove ${teacher.name}? Their classes and subjects will be left without a teacher.`)) return;
    try {
      await api.del(`/teachers/${teacher.id}`);
      toast.success('Teacher removed');
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  }

  function previewCsv() {
    setRows(parseTeacherRows(csv));
    setBulkResult(null);
  }

  async function submitBulk() {
    const validRows = rows.filter((r) => !r.problem);
    if (validRows.length === 0) return;
    setBulkBusy(true);
    try {
      const result = await api.post('/teachers/bulk', { rows: validRows });
      setBulkResult(result);
      toast.success(result.message);
      if (result.created > 0) {
        setCsv('');
        setRows([]);
        reload();
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBulkBusy(false);
    }
  }

  function closeBulk() {
    setBulkOpen(false);
    setCsv('');
    setRows([]);
    setBulkResult(null);
  }

  return (
    <>
      <PageHeader
        title="Teachers"
        subtitle="Staff who can sign in to the teacher portal."
        actions={
          <div className="row">
            <button className="btn btn-outline" onClick={() => setBulkOpen(true)}><Users size={17} />Bulk add</button>
            <button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={17} />Add teacher</button>
          </div>
        }
      />

      {created && (
        <div className="success-panel" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 18 }}>{created.teacher.name} has been added</h3>
          <p className="muted" style={{ margin: '6px 0 10px' }}>
            Login: <strong>{created.credentials.loginId}</strong> with first password <strong>{created.credentials.password}</strong>.
            Ask them to change it from Profile. To give them classes, open the Classes page.
          </p>
          <button className="btn btn-ghost btn-sm" onClick={() => setCreated(null)}>Dismiss</button>
        </div>
      )}

      {data.length === 0 ? (
        <div className="card"><EmptyState icon={Users} title="No teachers yet" text="Add your first teacher to get started." /></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Teacher</th><th>Staff ID</th><th>Subjects</th><th>Classes</th><th>Phone</th><th /></tr></thead>
            <tbody>
              {data.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className="person">
                      <div className="avatar avatar-sm">{t.name.replace(/^(Mr|Mrs|Miss|Dr)\.?\s+/, '')[0]}</div>
                      <div><div className="strong">{t.name}</div><div className="sub">{t.email}</div></div>
                    </div>
                  </td>
                  <td>{t.schoolId}</td>
                  <td>{(t.subjects || []).join(', ') || 'None'}</td>
                  <td>{t.classes.join(', ') || 'Not assigned'}</td>
                  <td>{t.phone}</td>
                  <td><div className="actions"><button className="icon-btn" onClick={() => remove(t)} aria-label={`Remove ${t.name}`}><Trash2 size={17} /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <Modal title="Add a teacher" onClose={() => setOpen(false)}>
          <form onSubmit={addTeacher}>
            <div className="form-grid">
              <div className="field full"><label htmlFor="t-name">Full name</label><input id="t-name" className="input" placeholder="Mrs. Jane Doe" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
              <div className="field"><label htmlFor="t-email">School email</label><input id="t-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
              <div className="field"><label htmlFor="t-phone">Phone number</label><input id="t-phone" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="field full"><label htmlFor="t-q">Qualification</label><input id="t-q" className="input" value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} /></div>
              <div className="field full">
                <span className="label">Subjects they can teach</span>
                <div className="checks">
                  {SUBJECTS.map((s) => (
                    <label key={s} className="check">
                      <input type="checkbox" checked={form.subjects.includes(s)} onChange={() => toggleSubject(s)} />
                      {s}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            {formError && <div className="error-note" role="alert" style={{ marginTop: 14 }}>{formError}</div>}
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn btn-primary">Add teacher</button>
            </div>
          </form>
        </Modal>
      )}
      {bulkOpen && (
        <Modal title="Bulk add teachers" onClose={closeBulk} wide>
          <p className="muted small" style={{ marginBottom: 10 }}>
            One teacher per line, separated by commas: <code>name,email,phone,qualification</code>. Phone and qualification can be left blank.
            Subjects can be assigned afterwards from the Classes page.
          </p>
          <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCsv(SAMPLE_CSV)}><FileText size={15} />Use sample data</button>
          </div>
          <textarea className="textarea" rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={SAMPLE_CSV} />
          <div className="form-actions" style={{ padding: 0, marginTop: 14 }}>
            <button type="button" className="btn btn-ghost" onClick={closeBulk}>Close</button>
            <button type="button" className="btn btn-outline" onClick={previewCsv} disabled={!csv.trim()}>Preview rows</button>
          </div>

          {rows.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="card-head" style={{ padding: 0, marginBottom: 10 }}>
                <h3 style={{ fontSize: 15 }}>Preview ({rows.length} row{rows.length === 1 ? '' : 's'}, {rows.filter((r) => !r.problem).length} ready)</h3>
                <button className="btn btn-primary btn-sm" onClick={submitBulk} disabled={bulkBusy || rows.every((r) => r.problem)}>
                  {bulkBusy ? 'Adding…' : `Add ${rows.filter((r) => !r.problem).length} teacher${rows.filter((r) => !r.problem).length === 1 ? '' : 's'}`}
                </button>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Status</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.line}>
                        <td className="muted">{r.line}</td>
                        <td className="strong">{r.name}</td>
                        <td>{r.email}</td>
                        <td>{r.problem ? <Badge tone="danger">{r.problem}</Badge> : <Badge tone="ok">Ready</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {bulkResult && (
            <div className="success-panel" style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: 16 }}>{bulkResult.message}</h3>
              <div className="table-wrap" style={{ marginTop: 10 }}>
                <table className="table">
                  <thead><tr><th>Row</th><th>Name / issue</th><th>Login</th><th>Password</th></tr></thead>
                  <tbody>
                    {bulkResult.results.map((r) => (
                      <tr key={r.row}>
                        <td className="muted">{r.row}</td>
                        <td>{r.ok ? <span className="strong">{r.name}</span> : <Badge tone="danger">{r.message}</Badge>}</td>
                        <td>{r.ok ? r.loginId : '-'}</td>
                        <td>{r.ok ? r.password : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
