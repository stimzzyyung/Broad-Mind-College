import { Link } from 'react-router-dom';
import {
  School, Users, MonitorPlay, ClipboardList, ArrowRight,
  Clock, HelpCircle, CheckCircle2, Calendar, Award, UserPlus
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import useFetch from '../../hooks/useFetch.js';
import StatCard from '../../components/ui/StatCard.jsx';
import TodayStrip from '../../components/ui/TodayStrip.jsx';
import Announcements from '../../components/ui/Announcements.jsx';
import Badge from '../../components/ui/Badge.jsx';
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
          <p>Here is what's on today, and how your classes and CBT examinations are performing.</p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <Link to="/teacher/register-student" className="btn btn-brass"><UserPlus size={17} />Register student</Link>
            <Link to="/exams/create" className="btn btn-on-dark"><Clock size={17} />Create CBT exam</Link>
            <Link to="/question-bank" className="btn btn-on-dark"><HelpCircle size={17} />Question Bank</Link>
            <Link to="/teacher/results" className="btn btn-on-dark"><ClipboardList size={17} />Enter results</Link>
          </div>
          <TodayStrip day={data.today.day} isToday={data.today.isToday} periods={lessons} />
        </div>
      </section>

      {/* Teacher CBT Stats Grid */}
      {data.cbt && (
        <div style={{ marginBottom: 20 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ fontSize: 18, color: 'var(--ink)' }}>CBT & Examinations</h3>
            <div className="row" style={{ gap: 8 }}>
              <Link to="/exams" className="btn btn-sm btn-outline">My Exams</Link>
              <Link to="/exam-results" className="btn btn-sm btn-primary">All Results</Link>
            </div>
          </div>
          <div className="grid grid-stats">
            <StatCard icon={HelpCircle} label="Total Questions" value={data.cbt.totalQuestions} subtext="In Question Bank" tone="primary" />
            <StatCard icon={CheckCircle2} label="Active Exams" value={data.cbt.activeExams} subtext="Open now" tone="ok" />
            <StatCard icon={Calendar} label="Scheduled Exams" value={data.cbt.scheduledExams} subtext="Upcoming" tone="warn" />
            <StatCard icon={Award} label="Completed Exams" value={data.cbt.completedExams} subtext="Past windows" tone="info" />
            <StatCard icon={Users} label="Student Submissions" value={data.cbt.totalCompletedAttempts} subtext="Processed scores" tone="brass" />
          </div>
        </div>
      )}

      <div className="grid grid-stats" style={{ marginBottom: 20 }}>
        <StatCard icon={School} label="My classes" value={data.counts.classes} />
        <StatCard icon={Users} label="Students" value={data.counts.students} tone="info" />
        <StatCard icon={MonitorPlay} label="Quizzes and tests" value={data.counts.quizzes} tone="brass" />
        <StatCard icon={ClipboardList} label="Submissions" value={data.counts.submissions} />
      </div>

      <div className="grid split">
        {/* Recent CBT Student Results */}
        <div className="card card-flush">
          <div className="card-head">
            <h3>Recent CBT Student Results</h3>
            <Link to="/exam-results" className="btn btn-ghost btn-sm">All CBT results <ArrowRight size={15} /></Link>
          </div>
          {!data.cbt?.studentResults || data.cbt.studentResults.length === 0 ? (
            <EmptyState title="No CBT results yet" text="Student CBT results will show here as examinations are submitted." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Student</th><th>Examination</th><th className="num">Score</th><th>Grade</th></tr></thead>
                <tbody>
                  {data.cbt.studentResults.map((s) => (
                    <tr key={s.id}>
                      <td className="strong">{s.studentName}</td>
                      <td>{s.examTitle}</td>
                      <td className="num">{s.score} ({s.percentage}%)</td>
                      <td><Badge tone="ok">{s.grade}</Badge></td>
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
