import { Link } from 'react-router-dom';
import { School, Users, MonitorPlay, ClipboardList, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import useFetch from '../../hooks/useFetch.js';
import StatCard from '../../components/ui/StatCard.jsx';
import TodayStrip from '../../components/ui/TodayStrip.jsx';
import Announcements from '../../components/ui/Announcements.jsx';
import { Loading, ErrorNote, EmptyState } from '../../components/ui/Feedback.jsx';
import { greeting, shortName, formatDateTime } from '../../utils/format.js';

export default function TeacherHome() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch('/dashboard');

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const lessons = data.today.lessons.map((l) => ({ time: l.time, subject: l.subject, note: l.className }));

  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <h1>{greeting()}, {shortName(user.name)}</h1>
          <p>Here is what's on today, and how your classes are doing.</p>
          <div className="row">
            <Link to="/teacher/results" className="btn btn-brass"><ClipboardList size={17} />Enter results</Link>
            <Link to="/teacher/lms/new" className="btn btn-on-dark"><MonitorPlay size={17} />New quiz or test</Link>
          </div>
          <TodayStrip day={data.today.day} isToday={data.today.isToday} periods={lessons} />
        </div>
      </section>

      <div className="grid grid-stats" style={{ marginBottom: 20 }}>
        <StatCard icon={School} label="My classes" value={data.counts.classes} />
        <StatCard icon={Users} label="Students" value={data.counts.students} tone="info" />
        <StatCard icon={MonitorPlay} label="Quizzes and tests" value={data.counts.quizzes} tone="brass" />
        <StatCard icon={ClipboardList} label="Submissions" value={data.counts.submissions} />
      </div>

      <div className="grid split">
        <div className="card card-flush">
          <div className="card-head">
            <h3>Recent quiz submissions</h3>
            <Link to="/teacher/lms" className="btn btn-ghost btn-sm">All quizzes <ArrowRight size={15} /></Link>
          </div>
          {data.recentSubmissions.length === 0 ? (
            <EmptyState title="No submissions yet" text="Once students take a quiz or test, their scores will show here." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Student</th><th>Quiz</th><th className="num">Score</th><th>Date</th></tr></thead>
                <tbody>
                  {data.recentSubmissions.map((s) => (
                    <tr key={s.id}>
                      <td className="strong">{s.studentName}</td>
                      <td>{s.quizTitle}</td>
                      <td className="num">{s.score}/{s.total}</td>
                      <td>{formatDateTime(s.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>My classes</h3></div>
            <div className="list">
              {data.classes.map((c) => (
                <div className="list-item" key={c.id}>
                  <div className="avatar avatar-sm">{c.name[0]}</div>
                  <div className="grow">
                    <div className="title">{c.name} {c.isFormTeacher && <span className="badge badge-info" style={{ marginLeft: 6 }}>Form teacher</span>}</div>
                    <div className="sub">{c.subjects.join(', ') || 'No subject assigned'}</div>
                  </div>
                  <span className="badge badge-neutral">{c.studentCount}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Notice board</h3></div>
            <Announcements items={data.announcements} />
          </div>
        </div>
      </div>
    </>
  );
}
