import { useState } from 'react';
import { Copy, UserPlus, Check, Users, FileText, Download } from 'lucide-react';
import { api } from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Loading, ErrorNote } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';

const EMPTY = {
  firstName: '', lastName: '', gender: '', dob: '', classId: '',
  guardianName: '', guardianPhone: '', address: '', email: '',
};

const SAMPLE_CSV = `firstName,lastName,gender,dob,className,guardianName,guardianPhone,address,email
Ada,Obi,Female,2013-05-14,JSS 1A,Mr Obi,0801 234 5678,12 Palm Street,
Bayo,Lawal,Male,2013-08-02,JSS 1A,Mrs Lawal,0802 345 6789,,`;

function parseRows(text, classes) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length && /firstname/i.test(lines[0]) && /lastname/i.test(lines[0])) lines.shift(); // drop a header row if pasted

  return lines.map((line, i) => {
    const cols = line.split(',').map((c) => c.trim());
    const [firstName, lastName, gender, dob, className, guardianName, guardianPhone, address, email] = cols;
    const cls = classes.find((c) => c.name.toLowerCase() === (className || '').toLowerCase());
    let problem = null;
    if (!firstName || !lastName || !gender || !dob || !className || !guardianName || !guardianPhone) {
      problem = 'Missing a required field';
    } else if (!cls) {
      problem = `Unknown class "${className}"`;
    }
    return {
      line: i + 1, firstName, lastName, gender, dob, className, guardianName, guardianPhone,
      address: address || '', email: email || '', classId: cls ? cls.id : null, problem,
    };
  });
}

export default function RegisterStudent() {
  const toast = useToast();
  const classes = useFetch('/classes');
  const [mode, setMode] = useState('single');

  // ----- Single registration -----
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);

  // ----- Bulk registration -----
  const [csv, setCsv] = useState('');
  const [rows, setRows] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await api.post('/students', form);
      setCreated(result);
      setForm(EMPTY);
      toast.success(`${result.student.name} has been registered`);
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

  function previewCsv() {
    setRows(parseRows(csv, classes.data));
    setBulkResult(null);
  }

  async function submitBulk() {
    const validRows = rows.filter((r) => !r.problem);
    if (validRows.length === 0) return;
    setBulkBusy(true);
    try {
      const result = await api.post('/students/bulk', { rows: validRows });
      setBulkResult(result);
      toast.success(result.message);
      if (result.created > 0) {
        setCsv('');
        setRows([]);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function copyAllCredentials() {
    const lines = bulkResult.results.filter((r) => r.ok).map((r) => `${r.name}\t${r.loginId}\t${r.password}`);
    await navigator.clipboard.writeText(['Name\tLogin ID\tPassword', ...lines].join('\n'));
    toast.success('Credentials copied');
  }

  if (classes.loading) return <Loading />;
  if (classes.error) return <ErrorNote message={classes.error} onRetry={classes.reload} />;

  return (
    <>
      <PageHeader title="Register a student" subtitle="Add a new student, one at a time or many at once. The portal creates each school ID and first password." />

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={mode === 'single'} className={`tab ${mode === 'single' ? 'active' : ''}`} onClick={() => setMode('single')}><UserPlus size={15} style={{ verticalAlign: -3, marginRight: 6 }} />One at a time</button>
        <button role="tab" aria-selected={mode === 'bulk'} className={`tab ${mode === 'bulk' ? 'active' : ''}`} onClick={() => setMode('bulk')}><Users size={15} style={{ verticalAlign: -3, marginRight: 6 }} />Bulk registration</button>
      </div>

      {mode === 'single' && (
        <>
          {created && (
            <div className="success-panel" style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 18 }}>{created.student.name} is now in {created.student.className}</h3>
              <p className="muted" style={{ margin: '6px 0 12px' }}>
                Give these login details to the parent or guardian. The student can change the password from the Profile page.
              </p>
              <div className="row" style={{ gap: 24, marginBottom: 14 }}>
                <div><div className="small muted">Login ID</div><div className="strong" style={{ fontSize: 18 }}>{created.credentials.loginId}</div></div>
                <div><div className="small muted">First password</div><div className="strong" style={{ fontSize: 18 }}>{created.credentials.password}</div></div>
              </div>
              <div className="row">
                <button className="btn btn-outline btn-sm" onClick={copyLogin}>
                  {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'Copy login details'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setCreated(null)}>Register another student</button>
              </div>
            </div>
          )}

          <form className="stack" onSubmit={handleSubmit}>
            <div className="card">
              <div className="card-head"><h3>Student details</h3></div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="firstName">First name</label>
                  <input id="firstName" className="input" value={form.firstName} onChange={set('firstName')} required />
                </div>
                <div className="field">
                  <label htmlFor="lastName">Last name</label>
                  <input id="lastName" className="input" value={form.lastName} onChange={set('lastName')} required />
                </div>
                <div className="field">
                  <label htmlFor="gender">Gender</label>
                  <select id="gender" className="select" value={form.gender} onChange={set('gender')} required>
                    <option value="">Choose…</option>
                    <option>Female</option>
                    <option>Male</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="dob">Date of birth</label>
                  <input id="dob" type="date" className="input" value={form.dob} onChange={set('dob')} required />
                </div>
                <div className="field">
                  <label htmlFor="classId">Class</label>
                  <select id="classId" className="select" value={form.classId} onChange={set('classId')} required>
                    <option value="">Choose a class…</option>
                    {classes.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="email">Email (optional)</label>
                  <input id="email" type="email" className="input" value={form.email} onChange={set('email')} />
                  <span className="hint">Students can sign in with their school ID even without an email.</span>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-head"><h3>Parent or guardian</h3></div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="guardianName">Guardian's full name</label>
                  <input id="guardianName" className="input" value={form.guardianName} onChange={set('guardianName')} required />
                </div>
                <div className="field">
                  <label htmlFor="guardianPhone">Guardian's phone number</label>
                  <input id="guardianPhone" type="tel" className="input" value={form.guardianPhone} onChange={set('guardianPhone')} required />
                </div>
                <div className="field full">
                  <label htmlFor="address">Home address</label>
                  <input id="address" className="input" value={form.address} onChange={set('address')} />
                </div>
              </div>
            </div>

            {error && <div className="error-note" role="alert">{error}</div>}

            <div className="form-actions" style={{ marginTop: 0 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setForm(EMPTY)}>Clear form</button>
              <button className="btn btn-primary" disabled={busy}><UserPlus size={17} />{busy ? 'Registering…' : 'Register student'}</button>
            </div>
          </form>
        </>
      )}

      {mode === 'bulk' && (
        <div className="stack" style={{ gap: 20 }}>
          <div className="card">
            <div className="card-head">
              <h3>Paste student rows</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCsv(SAMPLE_CSV)}><FileText size={15} />Use sample data</button>
            </div>
            <p className="muted small" style={{ marginBottom: 10 }}>
              One student per line, separated by commas: <code>firstName,lastName,gender,dob,className,guardianName,guardianPhone,address,email</code>.
              Address and email can be left blank. Class names must match a class exactly, e.g. "JSS 1A".
            </p>
            <textarea
              className="textarea" rows={8} value={csv} onChange={(e) => setCsv(e.target.value)}
              placeholder={SAMPLE_CSV}
            />
            <div className="form-actions" style={{ padding: 0, marginTop: 14 }}>
              <span className="muted small grow">{classes.data.map((c) => c.name).join(' · ')}</span>
              <button type="button" className="btn btn-outline" onClick={previewCsv} disabled={!csv.trim()}>Preview rows</button>
            </div>
          </div>

          {rows.length > 0 && (
            <div className="card card-flush">
              <div className="card-head">
                <h3>Preview ({rows.length} row{rows.length === 1 ? '' : 's'}, {rows.filter((r) => !r.problem).length} ready)</h3>
                <button className="btn btn-primary btn-sm" onClick={submitBulk} disabled={bulkBusy || rows.every((r) => r.problem)}>
                  <Users size={16} />{bulkBusy ? 'Registering…' : `Register ${rows.filter((r) => !r.problem).length} student${rows.filter((r) => !r.problem).length === 1 ? '' : 's'}`}
                </button>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>#</th><th>Name</th><th>Class</th><th>Guardian</th><th>Status</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.line}>
                        <td className="muted">{r.line}</td>
                        <td className="strong">{r.firstName} {r.lastName}</td>
                        <td>{r.className}</td>
                        <td>{r.guardianName}</td>
                        <td>{r.problem ? <Badge tone="danger">{r.problem}</Badge> : <Badge tone="ok">Ready</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {bulkResult && (
            <div className="success-panel">
              <h3 style={{ fontSize: 18 }}>{bulkResult.message}</h3>
              <p className="muted" style={{ margin: '6px 0 12px' }}>Each student can sign in with their school ID and the first password shown below.</p>
              <div className="table-wrap" style={{ marginBottom: 14 }}>
                <table className="table">
                  <thead><tr><th>Row</th><th>Name / issue</th><th>Login ID</th><th>Password</th></tr></thead>
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
              {bulkResult.created > 0 && (
                <button className="btn btn-outline btn-sm" onClick={copyAllCredentials}><Download size={16} />Copy all credentials</button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
