import { useState } from 'react';
import { Eye, MonitorPlay, Trash2 } from 'lucide-react';
import { api } from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Loading, ErrorNote, EmptyState } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { formatDate } from '../../utils/format.js';

export default function AdminLMS() {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch('/lms/quizzes');
  const [viewId, setViewId] = useState(null);
  const details = useFetch(viewId ? `/lms/quizzes/${viewId}/submissions` : null);

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  async function remove(quiz) {
    if (!window.confirm(`Delete "${quiz.title}" and all its scores?`)) return;
    try {
      await api.del(`/lms/quizzes/${quiz.id}`);
      toast.success('Deleted');
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <>
      <PageHeader title="LMS" subtitle="Every quiz and test that teachers have set, and how students are doing." />

      {data.length === 0 ? (
        <div className="card"><EmptyState icon={MonitorPlay} title="No quizzes yet" text="Teachers create quizzes and tests from their own portal." /></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Title</th><th>Class</th><th>Teacher</th><th>Due</th><th className="num">Taken</th><th className="num">Average</th><th /></tr></thead>
            <tbody>
              {data.map((q) => (
                <tr key={q.id}>
                  <td>
                    <div className="strong">{q.title}</div>
                    <div className="row" style={{ gap: 6, marginTop: 2 }}><Badge tone={q.type === 'Test' ? 'warn' : 'info'}>{q.type}</Badge><span className="small muted">{q.subject}, {q.questionCount} questions</span></div>
                  </td>
                  <td>{q.className}</td>
                  <td>{q.teacherName}</td>
                  <td className="nowrap">{q.dueDate ? formatDate(q.dueDate) : 'No date'}</td>
                  <td className="num">{q.submissionCount}</td>
                  <td className="num">{q.averagePercent === null ? '-' : `${q.averagePercent}%`}</td>
                  <td>
                    <div className="actions">
                      <button className="btn btn-outline btn-sm" onClick={() => setViewId(q.id)}><Eye size={15} />Scores</button>
                      <button className="icon-btn" onClick={() => remove(q)} aria-label={`Delete ${q.title}`}><Trash2 size={17} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewId && (
        <Modal title="Scores" onClose={() => setViewId(null)}>
          {details.loading || !details.data ? <Loading /> : (
            <>
              <p className="muted" style={{ marginBottom: 12 }}>{details.data.quiz.title} ({details.data.quiz.className})</p>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Student</th><th className="num">Score</th><th>Submitted</th></tr></thead>
                  <tbody>
                    {details.data.rows.map((r) => (
                      <tr key={r.studentId}>
                        <td className="strong">{r.name}</td>
                        <td className="num">{r.submitted ? `${r.score}/${r.total}` : <Badge tone="neutral">Not taken</Badge>}</td>
                        <td>{r.submittedAt ? formatDate(r.submittedAt) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
