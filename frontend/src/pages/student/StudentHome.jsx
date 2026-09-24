import { Link } from 'react-router-dom';
import { Wallet, Award, MonitorPlay, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import useFetch from '../../hooks/useFetch.js';
import StatCard from '../../components/ui/StatCard.jsx';
import TodayStrip from '../../components/ui/TodayStrip.jsx';
import Announcements from '../../components/ui/Announcements.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Loading, ErrorNote, EmptyState } from '../../components/ui/Feedback.jsx';
import { greeting, shortName, money, gradeTone, formatDate } from '../../utils/format.js';

export default function StudentHome() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch('/dashboard');

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <h1>{greeting()}, {shortName(user.name)}</h1>
          <p>{data.className} {data.formTeacher ? `· Form teacher: ${data.formTeacher}` : ''}</p>
          <div className="row">
            <Link to="/student/lms" className="btn btn-brass"><MonitorPlay size={17} />Quizzes & tests</Link>
            <Link to="/student/fees" className="btn btn-on-dark"><Wallet size={17} />Pay fees</Link>
          </div>
          <TodayStrip day={data.today.day} isToday={data.today.isToday} periods={data.today.lessons} />
        </div>
      </section>

      <div className="grid grid-stats" style={{ marginBottom: 20 }}>
        <StatCard icon={Wallet} label="Fee balance" value={money(data.fees.balance)} tone={data.fees.balance > 0 ? 'danger' : 'primary'} />
        <StatCard icon={Award} label="Last average" value={data.lastResult ? `${data.lastResult.average}%` : '—'} tone="info" />
        <StatCard icon={MonitorPlay} label="Pending quizzes" value={data.pendingQuizzes.length} tone="brass" />
      </div>

      <div className="grid split">
        <div className="card">
          <div className="card-head">
            <h3>Last result</h3>
            <Link to="/student/results" className="btn btn-ghost btn-sm">Full report <ArrowRight size={15} /></Link>
          </div>
          {!data.lastResult ? (
            <EmptyState icon={Award} title="No results yet" text="Your results will show here once your teachers enter them." />
          ) : (
            <div className="summary-strip">
              <div className="summary-box"><div className="v">{data.lastResult.average}%</div><div className="l">Average</div></div>
              <div className="summary-box"><div className="v"><Badge tone={gradeTone(data.lastResult.grade)}>{data.lastResult.grade}</Badge></div><div className="l">Grade</div></div>
              <div className="summary-box"><div className="v">{data.lastResult.position} / {data.lastResult.outOf}</div><div className="l">Position</div></div>
              <div className="summary-box"><div className="v" style={{ fontSize: 14 }}>{data.lastResult.term}</div><div className="l">{data.lastResult.session}</div></div>
            </div>
          )}
        </div>

        <div className="card card-flush">
          <div className="card-head">
            <h3>Pending quizzes & tests</h3>
            <Link to="/student/lms" className="btn btn-ghost btn-sm">All <ArrowRight size={15} /></Link>
          </div>
          {data.pendingQuizzes.length === 0 ? (
            <EmptyState icon={MonitorPlay} title="You're all caught up" text="No quizzes or tests waiting for you right now." />
          ) : (
            <div className="list">
              {data.pendingQuizzes.map((q) => (
                <Link to={`/student/lms/${q.id}`} className="list-item" key={q.id}>
                  <div className="grow">
                    <div className="title">{q.title}</div>
                    <div className="sub">{q.subject} · {q.questionCount} questions · {q.durationMins} mins</div>
                  </div>
                  <Badge tone={q.type === 'Test' ? 'warn' : 'info'}>{q.type}</Badge>
                  {q.dueDate && <span className="small muted" style={{ marginLeft: 8 }}>Due {formatDate(q.dueDate)}</span>}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-head"><h3>Notice board</h3></div>
        <Announcements items={data.announcements} />
      </div>
    </>
  );
}
