import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import TimetableGrid from '../../components/ui/TimetableGrid.jsx';
import { Loading, ErrorNote } from '../../components/ui/Feedback.jsx';

export default function TeacherClasses() {
  const { user } = useAuth();
  const classes = useFetch('/classes');
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('students');

  const activeId = selectedId ?? (classes.data && classes.data[0] && classes.data[0].id) ?? null;
  const detail = useFetch(activeId ? `/classes/${activeId}` : null);

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
          <div className="card-head"><h3>{cls.name}</h3></div>

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
            <TimetableGrid
              timetable={cls.timetable}
              highlight={(subject) => cls.subjects.some((s) => s.name === subject && s.teacherId === user.id)}
            />
          )}
        </div>
      )}
    </>
  );
}
