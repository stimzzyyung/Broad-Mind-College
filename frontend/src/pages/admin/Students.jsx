import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Pencil, Trash2, UserPlus, GraduationCap } from 'lucide-react';
import { api } from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Loading, ErrorNote, EmptyState } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { formatDate } from '../../utils/format.js';

export default function Students() {
  const toast = useToast();
  const students = useFetch('/students');
  const classes = useFetch('/classes');
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('');
  const [editing, setEditing] = useState(null);

  if (students.loading || classes.loading) return <Loading />;
  if (students.error || classes.error) return <ErrorNote message={students.error || classes.error} onRetry={() => { students.reload(); classes.reload(); }} />;

  const q = search.toLowerCase();
  const list = students.data.filter(
    (s) =>
      (!classId || s.classId === Number(classId)) &&
      (!q || s.name.toLowerCase().includes(q) || s.schoolId.toLowerCase().includes(q))
  );

  async function save(e) {
    e.preventDefault();
    try {
      await api.put(`/students/${editing.id}`, editing);
      toast.success('Student updated');
      setEditing(null);
      students.reload();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${editing.name}? Their payments, results and quiz scores will be deleted too.`)) return;
    try {
      await api.del(`/students/${editing.id}`);
      toast.success('Student removed');
      setEditing(null);
      students.reload();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const change = (field) => (e) => setEditing({ ...editing, [field]: e.target.value });

  return (
    <>
      <PageHeader
        title="Students"
        subtitle={`${students.data.length} students in the school.`}
        actions={<Link to="/admin/register-student" className="btn btn-primary"><UserPlus size={17} />Register student</Link>}
      />

      <div className="filters">
        <div className="search">
          <Search size={17} />
          <input className="input" placeholder="Search by name or ID" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search students" />
        </div>
        <select className="select" value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Filter by class">
          <option value="">All classes</option>
          {classes.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {list.length === 0 ? (
        <div className="card"><EmptyState icon={GraduationCap} title="No students found" text="Try another name or class." /></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Student</th><th>School ID</th><th>Class</th><th>Guardian</th><th>Registered</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="person">
                      <div className="avatar avatar-sm">{s.name[0]}</div>
                      <div><div className="strong">{s.name}</div><div className="sub">{s.gender}</div></div>
                    </div>
                  </td>
                  <td>{s.schoolId}</td>
                  <td>{s.className}</td>
                  <td>{s.guardianName}<div className="sub small muted">{s.guardianPhone}</div></td>
                  <td>{formatDate(s.createdAt)}</td>
                  <td><Badge tone={s.status === 'active' ? 'ok' : 'warn'}>{s.status}</Badge></td>
                  <td>
                    <div className="actions">
                      <button className="btn btn-outline btn-sm" onClick={() => setEditing({ ...s })}><Pencil size={15} />Edit</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={`Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            <div className="form-grid">
              <div className="field full"><label htmlFor="e-name">Full name</label><input id="e-name" className="input" value={editing.name} onChange={change('name')} required /></div>
              <div className="field">
                <label htmlFor="e-class">Class</label>
                <select id="e-class" className="select" value={editing.classId} onChange={change('classId')}>
                  {classes.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="e-status">Status</label>
                <select id="e-status" className="select" value={editing.status} onChange={change('status')}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
              <div className="field"><label htmlFor="e-g">Guardian</label><input id="e-g" className="input" value={editing.guardianName} onChange={change('guardianName')} /></div>
              <div className="field"><label htmlFor="e-gp">Guardian phone</label><input id="e-gp" className="input" value={editing.guardianPhone} onChange={change('guardianPhone')} /></div>
              <div className="field full"><label htmlFor="e-a">Address</label><input id="e-a" className="input" value={editing.address || ''} onChange={change('address')} /></div>
            </div>
            <div className="form-actions" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="btn btn-danger" onClick={remove}><Trash2 size={16} />Remove student</button>
              <div className="row">
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                <button className="btn btn-primary">Save changes</button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
