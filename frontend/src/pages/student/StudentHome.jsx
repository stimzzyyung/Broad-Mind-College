import { Link } from 'react-router-dom';
import {
  Wallet, Award, MonitorPlay, ArrowRight, Clock,
  PlayCircle, RotateCcw, Calendar, CheckCircle2
} from 'lucide-react';
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

  const cbt = data.cbt || { availableExams: [], upcomingExams: [], inProgressExams: [], completedExams: [] };

  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <h1>{greeting()}, {shortName(user.name)}</h1>
          <p>{data.className} {data.formTeacher ? `· Form teacher: ${data.formTeacher}` : ''}</p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <Link to="/exams" className="btn btn-brass"><Clock size={17} />My CBT examinations</Link>
            <Link to="/exam-schedule" className="btn btn-on-dark"><Calendar size={17} />Exam schedule</Link>
            <Link to="/student/fees" className="btn btn-on-dark"><Wallet size={17} />Pay fees</Link>
          </div>
          <TodayStrip day={data.today.day} isToday={data.today.isToday} periods={data.today.lessons} />
        </div>
      </section>

      {/* CBT Active & Available Alert */}
      {cbt.inProgressExams.length > 0 && (
        <div
          style={{
            padding: '16px 20px',
            background: 'var(--warn-tint)',
            border: '2px solid var(--warn)',
            borderRadius: '14px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <strong style={{ fontSize: 16, color: 'var(--warn)' }}>
              ⚠️ You have an examination in progress!
            </strong>
            <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>
              {cbt.inProgressExams[0].title} · Server timer is actively running.
            </div>
          </div>
          <Link
            to={`/exams/${cbt.inProgressExams[0].id}/take`}
            className="btn btn-primary"
            style={{ background: 'var(--warn)', borderColor: 'var(--warn)' }}
          >
            <RotateCcw size={16} /> Resume Examination Now
          </Link>
        </div>
      )}

      {/* CBT Statistics */}
      <div className="grid grid-stats" style={{ marginBottom: 20 }}>
        <StatCard
          icon={PlayCircle}
          label="Available Exams"
          value={cbt.availableExams.length}
          subtext="Ready to take now"
          tone={cbt.availableExams.length > 0 ? 'ok' : 'neutral'}
        />
        <StatCard
          icon={Calendar}
          label="Upcoming Exams"
          value={cbt.upcomingExams.length}
          subtext="Scheduled for your class"
          tone="warn"
        />
        <StatCard
          icon={CheckCircle2}
          label="Completed Exams"
          value={cbt.completedExams.length}
          subtext="Submitted scores"
          tone="info"
        />
        <StatCard
          icon={Wallet}
          label="Fee balance"
          value={money(data.fees.balance)}
          tone={data.fees.balance > 0 ? 'danger' : 'primary'}
        />
      </div>

      <div className="grid split">
        {/* Available CBT Exams */}
        <div className="card card-flush">
          <div className="card-head">
            <h3>Available Examinations</h3>
            <Link to="/exams" className="btn btn-ghost btn-sm">All exams <ArrowRight size={15} /></Link>
          </div>
          {cbt.availableExams.length === 0 ? (
            <EmptyState icon={Clock} title="No active exams right now" text="When a teacher opens a CBT examination for your class, it will appear here." />
          ) : (
            <div className="list">
              {cbt.availableExams.map((e) => (
                <div className="list-item" key={e.id}>
                  <div className="grow">
                    <div className="title">{e.title}</div>
                    <div className="sub">{e.subject} · {e.numberQuestions} questions · {e.durationMins} mins</div>
                  </div>
                  <Link to={`/exams/${e.id}/take`} className="btn btn-sm btn-primary">
                    <PlayCircle size={14} /> Start Exam
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Completed CBT Exam Results */}
        <div className="card card-flush">
          <div className="card-head">
            <h3>Completed CBT Results</h3>
            <Link to="/exam-results" className="btn btn-ghost btn-sm">Full results <ArrowRight size={15} /></Link>
          </div>
          {cbt.completedExams.length === 0 ? (
            <EmptyState icon={Award} title="No CBT results yet" text="Your test scores will display here once you submit an examination." />
          ) : (
            <div className="list">
              {cbt.completedExams.map((e) => (
                <div className="list-item" key={e.id}>
                  <div className="grow">
                    <div className="title">{e.title}</div>
                    <div className="sub">{e.subject} · Score: {e.score}/{e.totalMarks} ({e.percentage}%)</div>
                  </div>
                  <Badge tone={e.percentage >= 50 ? 'ok' : 'danger'}>
                    Grade {e.grade}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Notice Board */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-head"><h3>Notice board</h3></div>
        <Announcements items={data.announcements} />
      </div>
    </>
  );
}
