import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import TimetableGrid from '../../components/ui/TimetableGrid.jsx';
import { Loading, ErrorNote } from '../../components/ui/Feedback.jsx';

export default function StudentClasses() {
  const { user } = useAuth();
  const classes = useFetch('/classes');
  const [tab, setTab] = useState('timetable');

  const myClassId = classes.data && classes.data[0] ? classes.data[0].id : null;
  const detail = useFetch(myClassId ? `/classes/${myClassId}` : null);

  if (classes.loading) return <Loading />;
  if (classes.error) return <ErrorNote message={classes.error} onRetry={classes.reload} />;
  if (!myClassId) {
    return (
      <>
        <PageHeader title="My class" />
        <div className="card"><p className="muted">You have not been placed in a class yet. Speak to the school office.</p></div>
      </>
    );
  }
  if (detail.loading || !detail.data) return <Loading />;
  if (detail.error) return <ErrorNote message={detail.error} onRetry={detail.reload} />;

  const cls = detail.data;

  return (
    <>
      <PageHeader title={cls.name} subtitle={`Form teacher: ${cls.formTeacherName}`} />

      <div className="card">
        <div className="tabs" role="tablist">
          {[['timetable', 'Timetable'], ['subjects', 'Subjects'], ['classmates', `Classmates (${cls.students.length})`]].map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>

        {tab === 'timetable' && <TimetableGrid timetable={cls.timetable} />}

        {tab === 'subjects' && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Subject</th><th>Teacher</th></tr></thead>
              <tbody>
                {cls.subjects.map((s) => (
                  <tr key={s.name}><td className="strong">{s.name}</td><td>{s.teacherName}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'classmates' && (
          cls.students.length === 0 ? (
            <p className="muted">No classmates yet.</p>
          ) : (
            <div className="list">
              {cls.students.map((s) => (
                <div className="list-item" key={s.id}>
                  <div className="avatar avatar-sm">{s.name[0]}</div>
                  <div className="grow">
                    <div className="title">{s.name} {s.id === user.id && <span className="small muted">(You)</span>}</div>
                    <div className="sub">{s.schoolId}</div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </>
  );
}
