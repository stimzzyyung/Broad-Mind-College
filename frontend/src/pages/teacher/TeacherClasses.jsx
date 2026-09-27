import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus, Save, Trash2, UserPlus, X } from 'lucide-react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import TimetableGrid from '../../components/ui/TimetableGrid.jsx';
import { Loading, ErrorNote } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function TeacherClasses() {
  const { user } = useAuth();
  const toast = useToast();
  const classes = useFetch('/classes');
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('students');
  const [ttEdit, setTtEdit] = useState(false);
  const [ttDraft, setTtDraft] = useState(null);
  const [ttBusy, setTtBusy] = useState(false);

  const activeId = selectedId ?? (classes.data && classes.data[0] && classes.data[0].id) ?? null;
  const detail = useFetch(activeId ? `/classes/${activeId}` : null);

  useEffect(() => {
    if (detail.data) {
      setTtDraft(JSON.parse(JSON.stringify(detail.data.timetable)));
      setTtEdit(false);
    }
  }, [detail.data]);

  if (classes.loading) return <Loading />;
  if (classes.error) return <ErrorNote message={classes.error} onRetry={classes.reload} />;

  if (classes.data.length === 0) {
    return (
      <>
        <PageHeader title="My classes" subtitle="Classes you are the form teacher of, or teach a subject in." />
        <div className="card"><p className="muted">You are not assigned to any class yet. Speak to the school office.</p></div>
      </>
    );
  }

  const cls = detail.data;

  return (
    <>
      <PageHeader title="My classes" subtitle="Classes you are the form teacher of, or teach a subject in." />

      <div className="grid grid-stats" style={{ marginBottom: 20 }}>
        {classes.data.map((c) => (
          <button key={c.id} className={`class-card ${c.id === activeId ? 'active' : ''}`} onClick={() => { setSelectedId(c.id); setTab('students'); }}>
            <h4>{c.name}</h4>
            <span className="muted small">{c.formTeacherId === user.id ? 'You are the form teacher' : `Form teacher: ${c.formTeacherName}`}</span>
            <span className="strong">{c.studentCount} students</span>
          </button>
        ))}
      </div>

      {detail.loading || !cls ? (
        <Loading />
      ) : (
        <div className="card">
          <div className="card-head">
            <h3>{cls.name}</h3>
            <Link to="/teacher/register-student" className="btn btn-sm btn-primary">
              <UserPlus size={15} /> Register student
            </Link>
          </div>

          <div className="tabs" role="tablist">
            {[['students', `Students (${cls.students.length})`], ['subjects', 'Subjects'], ['timetable', 'Timetable']].map(([key, label]) => (
              <button key={key} role="tab" aria-selected={tab === key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>

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

          {tab === 'subjects' && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Subject</th><th>Teacher</th></tr></thead>
                <tbody>
                  {cls.subjects.map((s) => (
                    <tr key={s.name}>
                      <td className="strong">{s.name}</td>
                      <td>{s.teacherId === user.id ? <span className="badge badge-info">You</span> : s.teacherName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'timetable' && (
            ttEdit ? (
              <>
                <datalist id="teacher-tt-suggestions">
                  {cls.subjects.map((s) => <option key={s.name} value={s.name} />)}
                  <option value="Free period" />
                  <option value="Assembly" />
                  <option value="Break" />
                  <option value="Games/PE" />
                </datalist>
                <p className="muted small" style={{ marginBottom: 12 }}>
                  Update the weekly timetable for {cls.name}. Changes will be shared with students in this class.
                </p>
                <div className="table-wrap">
                  <table className="tt">
                    <thead>
                      <tr><th>Time</th>{WEEKDAYS.map((day) => <th key={day}>{day}</th>)}<th /></tr>
                    </thead>
                    <tbody>
                      {ttDraft.periods.map((time, row) => (
                        <tr key={row}>
                          <td><input className="input" style={{ minWidth: 130 }} value={time} onChange={(e) => setTtDraft((prev) => ({ ...prev, periods: prev.periods.map((period, i) => (i === row ? e.target.value : period)) }))} aria-label={`Period ${row + 1} time`} /></td>
                          {WEEKDAYS.map((day) => (
                            <td key={day}><input className="input" style={{ minWidth: 140 }} list="teacher-tt-suggestions" value={ttDraft.days[day][row]} onChange={(e) => setTtDraft((prev) => ({ ...prev, days: { ...prev.days, [day]: prev.days[day].map((cell, i) => (i === row ? e.target.value : cell)) } }))} aria-label={`${day} period ${row + 1}`} /></td>
                          ))}
                          <td>{ttDraft.periods.length > 1 && <button type="button" className="icon-btn" onClick={() => setTtDraft((prev) => ({ periods: prev.periods.filter((_, i) => i !== row), days: Object.fromEntries(WEEKDAYS.map((day) => [day, prev.days[day].filter((_, i) => i !== row)])) }))} aria-label={`Remove period ${row + 1}`}><Trash2 size={16} /></button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="form-actions" style={{ justifyContent: 'space-between' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setTtDraft((prev) => ({ periods: [...prev.periods, 'New period'], days: Object.fromEntries(WEEKDAYS.map((day) => [day, [...prev.days[day], 'Free period']])) }))}><Plus size={16} />Add period</button>
                  <div className="row">
                    <button type="button" className="btn btn-ghost" onClick={() => { setTtDraft(JSON.parse(JSON.stringify(cls.timetable))); setTtEdit(false); }}><X size={16} />Cancel</button>
                    <button type="button" className="btn btn-primary" disabled={ttBusy} onClick={async () => {
                      setTtBusy(true);
                      try {
                        await api.put(`/classes/${activeId}/timetable`, ttDraft);
                        toast.success('Timetable updated. Students in this class have been notified.');
                        setTtEdit(false);
                        detail.reload();
                      } catch (err) {
                        toast.error(err.message);
                      } finally {
                        setTtBusy(false);
                      }
                    }}><Save size={17} />{ttBusy ? 'Saving...' : 'Save timetable'}</button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => setTtEdit(true)}><Pencil size={15} />Edit timetable</button>
                </div>
                <TimetableGrid timetable={cls.timetable} highlight={(subject) => cls.subjects.some((s) => s.name === subject && s.teacherId === user.id)} />
              </>
            )
          )}
        </div>
      )}
    </>
  );
}
