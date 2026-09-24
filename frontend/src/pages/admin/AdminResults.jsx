import { useState } from 'react';
import { Award } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import BarList from '../../components/ui/BarList.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Loading, ErrorNote, EmptyState } from '../../components/ui/Feedback.jsx';
import { gradeTone, ordinal } from '../../utils/format.js';
import { TERMS, sessionOptions, lastTerm } from '../../utils/terms.js';

export default function AdminResults() {
  const { settings } = useAuth();
  const classes = useFetch('/classes');
  const start = lastTerm(settings); // start with the term that just ended
  const [classId, setClassId] = useState('');
  const [term, setTerm] = useState(start.term);
  const [session, setSession] = useState(start.session);

  const activeClass = classId || (classes.data && classes.data[0] && String(classes.data[0].id)) || '';
  const summary = useFetch(activeClass ? `/results/class-summary?classId=${activeClass}&term=${encodeURIComponent(term)}&session=${encodeURIComponent(session)}` : null);

  if (classes.loading) return <Loading />;
  if (classes.error) return <ErrorNote message={classes.error} onRetry={classes.reload} />;

  return (
    <>
      <PageHeader title="Results" subtitle="Compare how each class and subject is performing." />

      <div className="filters">
        <select className="select" value={activeClass} onChange={(e) => setClassId(e.target.value)} aria-label="Class">
          {classes.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="select" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Term">
          {TERMS.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select className="select" value={session} onChange={(e) => setSession(e.target.value)} aria-label="Session">
          {sessionOptions(settings.session).map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {summary.loading ? (
        <Loading />
      ) : summary.error ? (
        <ErrorNote message={summary.error} onRetry={summary.reload} />
      ) : !summary.data || summary.data.ranking.length === 0 ? (
        <div className="card">
          <EmptyState icon={Award} title="No results for this term yet" text="Results appear here after teachers enter and save scores." />
        </div>
      ) : (
        <div className="grid split">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Position</th><th>Student</th><th className="num">Total</th><th className="num">Average</th><th>Grade</th></tr></thead>
              <tbody>
                {summary.data.ranking.map((r) => (
                  <tr key={r.id}>
                    <td className="strong">{ordinal(r.position)}</td>
                    <td><div className="strong">{r.name}</div><div className="sub small muted">{r.schoolId}</div></td>
                    <td className="num">{r.total}</td>
                    <td className="num">{r.average}</td>
                    <td><Badge tone={gradeTone(r.grade)}>{r.grade}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-head"><h3>Average score by subject</h3></div>
            <BarList max={100} items={summary.data.subjectAverages.map((s) => ({ label: s.subject, value: s.average }))} />
          </div>
        </div>
      )}
    </>
  );
}
