import { useEffect, useState } from 'react';
import { Plus, Save, Trash2, Pencil, X } from 'lucide-react';
import { api } from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Modal from '../../components/ui/Modal.jsx';
import TimetableGrid from '../../components/ui/TimetableGrid.jsx';
import { Loading, ErrorNote } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function AdminClasses() {
  const toast = useToast();
  const classes = useFetch('/classes');
  const teachers = useFetch('/teachers');
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('subjects');
  const [draft, setDraft] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newClass, setNewClass] = useState({ name: '', level: 'Junior', formTeacherId: '' });

  // ----- Timetable editing -----
  const [ttEdit, setTtEdit] = useState(false);
  const [ttDraft, setTtDraft] = useState(null);
  const [ttBusy, setTtBusy] = useState(false);

  // Open the first class automatically
  const activeId = selectedId ?? (classes.data && classes.data[0] && classes.data[0].id) ?? null;
  const detail = useFetch(activeId ? `/classes/${activeId}` : null);

  // Copy the loaded class into an editable draft
  useEffect(() => {
    if (detail.data) {
      setDraft({
        formTeacherId: detail.data.formTeacherId || '',
        subjects: detail.data.subjects.map((s) => ({ name: s.name, teacherId: s.teacherId || '' })),
      });
      setTtDraft(JSON.parse(JSON.stringify(detail.data.timetable)));
      setTtEdit(false);
    }
  }, [detail.data]);

  if (classes.loading || teachers.loading) return <Loading />;
  if (classes.error || teachers.error) {
    return <ErrorNote message={classes.error || teachers.error} onRetry={() => { classes.reload(); teachers.reload(); }} />;
  }

  const cls = detail.data;

  async function saveAssignments() {
    try {
      await api.put(`/classes/${activeId}`, draft);
      toast.success('Teachers updated');
      classes.reload();
      detail.reload();
    } catch (err) {
      toast.error(err.message);
    }
  }

  function updateCell(day, row, value) {
    setTtDraft((prev) => ({
      ...prev,
      days: { ...prev.days, [day]: prev.days[day].map((cell, i) => (i === row ? value : cell)) },
    }));
  }

  function updatePeriodTime(row, value) {
    setTtDraft((prev) => ({ ...prev, periods: prev.periods.map((p, i) => (i === row ? value : p)) }));
  }

  function addPeriod() {
    setTtDraft((prev) => ({
      periods: [...prev.periods, 'New period'],
      days: Object.fromEntries(WEEKDAYS.map((day) => [day, [...prev.days[day], 'Free period']])),
    }));
  }

  function removePeriod(row) {
    setTtDraft((prev) => ({
      periods: prev.periods.filter((_, i) => i !== row),
      days: Object.fromEntries(WEEKDAYS.map((day) => [day, prev.days[day].filter((_, i) => i !== row)])),
    }));
  }

  function cancelTimetableEdit() {
    setTtDraft(JSON.parse(JSON.stringify(cls.timetable)));
    setTtEdit(false);
  }

  async function saveTimetable() {
    setTtBusy(true);
    try {
      await api.put(`/classes/${activeId}/timetable`, ttDraft);
      toast.success('Timetable updated. Students in this class have been notified.');
      detail.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTtBusy(false);
    }
  }

  async function createClass(e) {
    e.preventDefault();
    try {
      const made = await api.post('/classes', newClass);
      toast.success(`${made.name} created`);
      setAdding(false);
      setNewClass({ name: '', level: 'Junior', formTeacherId: '' });
      setSelectedId(made.id);
      classes.reload();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function deleteClass() {
    if (!window.confirm(`Delete ${cls.name}?`)) return;
    try {
      await api.del(`/classes/${activeId}`);
      toast.success('Class deleted');
      setSelectedId(null);
      classes.reload();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const teacherOptions = teachers.data.map((t) => <option key={t.id} value={t.id}>{t.name}</option>);

  return (
    <>
      <PageHeader
        title="Classes"
        subtitle="See each class, choose its teachers and check the timetable."
        actions={<button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={17} />Add class</button>}
      />

      <div className="grid grid-stats" style={{ marginBottom: 20 }}>
        {classes.data.map((c) => (
          <button key={c.id} className={`class-card ${c.id === activeId ? 'active' : ''}`} onClick={() => { setSelectedId(c.id); setTab('subjects'); }}>
            <h4>{c.name}</h4>
            <span className="muted small">Form teacher: {c.formTeacherName}</span>
            <span className="strong">{c.studentCount} students</span>
          </button>
        ))}
      </div>

      {detail.loading || !cls || !draft ? (
        <Loading />
      ) : (
        <div className="card">
          <div className="card-head">
            <h3>{cls.name}</h3>
            <button className="btn btn-danger btn-sm" onClick={deleteClass}><Trash2 size={15} />Delete class</button>
          </div>

          <div className="tabs" role="tablist">
            {[['subjects', 'Teachers and subjects'], ['students', `Students (${cls.students.length})`], ['timetable', 'Timetable']].map(([key, label]) => (
              <button key={key} role="tab" aria-selected={tab === key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>

          {tab === 'subjects' && (
            <>
              <div className="field" style={{ maxWidth: 340, marginBottom: 18 }}>
                <label htmlFor="form-teacher">Form teacher</label>
                <select id="form-teacher" className="select" value={draft.formTeacherId} onChange={(e) => setDraft({ ...draft, formTeacherId: e.target.value })}>
                  <option value="">Not assigned</option>
                  {teacherOptions}
                </select>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Subject</th><th>Teacher</th></tr></thead>
                  <tbody>
                    {draft.subjects.map((s, i) => (
                      <tr key={s.name}>
                        <td className="strong">{s.name}</td>
                        <td>
                          <select
                            className="select" style={{ maxWidth: 320 }} aria-label={`Teacher for ${s.name}`} value={s.teacherId}
                            onChange={(e) => {
                              const subjects = draft.subjects.map((x, idx) => (idx === i ? { ...x, teacherId: e.target.value } : x));
                              setDraft({ ...draft, subjects });
                            }}
                          >
                            <option value="">Not assigned</option>
                            {teacherOptions}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="form-actions">
                <button className="btn btn-primary" onClick={saveAssignments}><Save size={17} />Save teachers</button>
              </div>
            </>
          )}

          {tab === 'students' && (
            cls.students.length === 0 ? (
              <p className="muted">No students in this class yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Name</th><th>School ID</th><th>Gender</th></tr></thead>
                  <tbody>
                    {cls.students.map((s) => (
                      <tr key={s.id}><td className="strong">{s.name}</td><td>{s.schoolId}</td><td>{s.gender}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === 'timetable' && (
            ttEdit ? (
              <>
                <datalist id="tt-suggestions">
                  {cls.subjects.map((s) => <option key={s.name} value={s.name} />)}
                  <option value="Free period" />
                  <option value="Assembly" />
                  <option value="Break" />
                  <option value="Games/PE" />
                </datalist>
                <p className="muted small" style={{ marginBottom: 12 }}>
                  Type a subject name, or something like "Assembly" or "Free period". Suggestions include this class's subjects.
                </p>
                <div className="table-wrap">
                  <table className="tt">
                    <thead>
                      <tr>
                        <th>Time</th>
                        {WEEKDAYS.map((day) => <th key={day}>{day}</th>)}
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {ttDraft.periods.map((time, row) => (
                        <tr key={row}>
                          <td>
                            <input
                              className="input" style={{ minWidth: 130 }} value={time}
                              onChange={(e) => updatePeriodTime(row, e.target.value)}
                              aria-label={`Period ${row + 1} time`}
                            />
                          </td>
                          {WEEKDAYS.map((day) => (
                            <td key={day}>
                              <input
                                className="input" style={{ minWidth: 140 }} list="tt-suggestions"
                                value={ttDraft.days[day][row]}
                                onChange={(e) => updateCell(day, row, e.target.value)}
                                aria-label={`${day} period ${row + 1}`}
                              />
                            </td>
                          ))}
                          <td>
                            {ttDraft.periods.length > 1 && (
                              <button type="button" className="icon-btn" onClick={() => removePeriod(row)} aria-label={`Remove period ${row + 1}`}>
                                <Trash2 size={16} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="form-actions" style={{ justifyContent: 'space-between' }}>
                  <button type="button" className="btn btn-outline" onClick={addPeriod}><Plus size={16} />Add period</button>
                  <div className="row">
                    <button type="button" className="btn btn-ghost" onClick={cancelTimetableEdit}><X size={16} />Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={saveTimetable} disabled={ttBusy}>
                      <Save size={17} />{ttBusy ? 'Saving…' : 'Save timetable'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => setTtEdit(true)}><Pencil size={15} />Edit timetable</button>
                </div>
                <TimetableGrid timetable={cls.timetable} />
              </>
            )
          )}
        </div>
      )}

      {adding && (
        <Modal title="Add a class" onClose={() => setAdding(false)}>
          <form onSubmit={createClass}>
            <div className="form-grid">
              <div className="field"><label htmlFor="c-name">Class name</label><input id="c-name" className="input" placeholder="JSS 3A" value={newClass.name} onChange={(e) => setNewClass({ ...newClass, name: e.target.value })} required /></div>
              <div className="field">
                <label htmlFor="c-level">Level</label>
                <select id="c-level" className="select" value={newClass.level} onChange={(e) => setNewClass({ ...newClass, level: e.target.value })}>
                  <option>Junior</option><option>Senior</option>
                </select>
              </div>
              <div className="field full">
                <label htmlFor="c-ft">Form teacher</label>
                <select id="c-ft" className="select" value={newClass.formTeacherId} onChange={(e) => setNewClass({ ...newClass, formTeacherId: e.target.value })}>
                  <option value="">Choose later</option>
                  {teacherOptions}
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
              <button className="btn btn-primary">Create class</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
