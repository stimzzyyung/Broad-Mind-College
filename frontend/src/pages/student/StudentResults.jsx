import { Printer } from 'lucide-react';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Loading, ErrorNote, EmptyState } from '../../components/ui/Feedback.jsx';
import { gradeTone } from '../../utils/format.js';
import { useSearchParams } from 'react-router-dom';

export default function StudentResults() {
  const [params, setParams] = useSearchParams();
  const term = params.get('term') || '';
  const session = params.get('session') || '';

  const query = term && session ? `?term=${encodeURIComponent(term)}&session=${encodeURIComponent(session)}` : '';
  const { data, loading, error, reload } = useFetch(`/results/my${query}`);

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  function change(field, value) {
    const next = new URLSearchParams(params);
    if (field === 'term') next.set('term', value);
    if (field === 'session') next.set('session', value);
    setParams(next);
  }

  if (data.terms.length === 0) {
    return (
      <>
        <PageHeader title="My results" />
        <div className="card"><EmptyState title="No results yet" text="Your results will appear here once your teachers enter them." /></div>
      </>
    );
  }

  const currentTerm = term || data.term;
  const currentSession = session || data.session;
  const sessions = [...new Set(data.terms.map((t) => t.session))];
  const termsForSession = data.terms.filter((t) => t.session === currentSession).map((t) => t.term);

  return (
    <>
      <PageHeader
        title="My results" subtitle={`${data.student.name} · ${data.student.className}`}
        actions={<button className="btn btn-outline" onClick={() => window.print()}><Printer size={17} />Print report</button>}
      />

      <div className="filters no-print">
        <select className="select" value={currentSession} onChange={(e) => change('session', e.target.value)}>
          {sessions.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="select" value={currentTerm} onChange={(e) => change('term', e.target.value)}>
          {termsForSession.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>

      <div className="report-card">
        <div className="report-head print-only">
          <h2>{data.school.schoolName}</h2>
          <p>{data.school.motto}</p>
          <p>{data.school.address} · {data.school.phone}</p>
        </div>

        <div className="report-meta">
          <div><span className="muted small">Student</span><div className="strong">{data.student.name}</div></div>
          <div><span className="muted small">School ID</span><div className="strong">{data.student.schoolId}</div></div>
          <div><span className="muted small">Class</span><div className="strong">{data.student.className}</div></div>
          <div><span className="muted small">Term</span><div className="strong">{currentTerm}, {currentSession}</div></div>
        </div>

        {data.results.length === 0 ? (
          <EmptyState title="No scores for this term" text="No subject scores have been entered for this term yet." />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Subject</th><th className="num">CA (/40)</th><th className="num">Exam (/60)</th><th className="num">Total</th><th>Grade</th><th>Remark</th></tr></thead>
                <tbody>
                  {data.results.map((r) => (
                    <tr key={r.id}>
                      <td className="strong">{r.subject}</td>
                      <td className="num">{r.ca}</td>
                      <td className="num">{r.exam}</td>
                      <td className="num strong">{r.total}</td>
                      <td><Badge tone={gradeTone(r.grade)}>{r.grade}</Badge></td>
                      <td>{r.remark}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.summary && (
              <div className="summary-strip">
                <div className="summary-box"><div className="v">{data.summary.total}</div><div className="l">Total score</div></div>
                <div className="summary-box"><div className="v">{data.summary.average}%</div><div className="l">Average</div></div>
                <div className="summary-box"><div className="v"><Badge tone={gradeTone(data.summary.grade)}>{data.summary.grade}</Badge></div><div className="l">Grade</div></div>
                <div className="summary-box"><div className="v">{data.summary.position} / {data.summary.outOf}</div><div className="l">Position in class</div></div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
