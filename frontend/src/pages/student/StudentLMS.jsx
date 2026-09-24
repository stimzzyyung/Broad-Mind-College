import { Link } from 'react-router-dom';
import { MonitorPlay } from 'lucide-react';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Loading, ErrorNote, EmptyState } from '../../components/ui/Feedback.jsx';
import { formatDate } from '../../utils/format.js';

export default function StudentLMS() {
  const { data, loading, error, reload } = useFetch('/lms/quizzes');

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader title="Quizzes & tests" subtitle="Everything set for your class." />

      {data.length === 0 ? (
        <div className="card"><EmptyState icon={MonitorPlay} title="Nothing here yet" text="Your teachers have not set any quizzes or tests for your class yet." /></div>
      ) : (
        <div className="list">
          {data.map((q) => {
            const done = !!q.mySubmission;
            const pct = done ? Math.round((q.mySubmission.score / q.mySubmission.total) * 100) : null;
            return (
              <Link to={`/student/lms/${q.id}`} className="list-item" key={q.id}>
                <div className="grow">
                  <div className="title">{q.title}</div>
                  <div className="sub">{q.subject} · {q.teacherName} · {q.questionCount} questions · {q.durationMins} mins{q.dueDate ? ` · Due ${formatDate(q.dueDate)}` : ''}</div>
                </div>
                <Badge tone={q.type === 'Test' ? 'warn' : 'info'}>{q.type}</Badge>
                {done ? (
                  <span className="badge badge-ok" style={{ marginLeft: 8 }}>{q.mySubmission.score}/{q.mySubmission.total} ({pct}%)</span>
                ) : q.closed ? (
                  <span className="badge badge-neutral" style={{ marginLeft: 8 }}>Closed</span>
                ) : (
                  <span className="badge badge-warn" style={{ marginLeft: 8 }}>Pending</span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
