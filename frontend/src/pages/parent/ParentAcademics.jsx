import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import TimetableGrid from '../../components/ui/TimetableGrid.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Loading, ErrorNote, EmptyState } from '../../components/ui/Feedback.jsx';
import { gradeTone } from '../../utils/format.js';

export default function ParentAcademics() {
  const children = useFetch('/students');
  const [params, setParams] = useSearchParams();
  const [childId, setChildId] = useState(null);
  const [tab, setTab] = useState('results');
  const selectedId = childId || (children.data && children.data[0] && children.data[0].id);
  const child = children.data && children.data.find((item) => item.id === selectedId);
  const term = params.get('term') || '';
  const session = params.get('session') || '';
  const query = term && session ? `?term=${encodeURIComponent(term)}&session=${encodeURIComponent(session)}` : '';
  const results = useFetch(selectedId ? `/results/child/${selectedId}${query}` : null);
  const classDetail = useFetch(child && child.className !== 'Unassigned' ? `/classes/${child.classId}` : null);

  if (children.loading) return <Loading />;
  if (children.error) return <ErrorNote message={children.error} onRetry={children.reload} />;
  if (!children.data.length) {
    return <><PageHeader title="Results & timetable" /><div className="card"><EmptyState title="No children registered yet" text="Register a child to see their results and timetable." /></div></>;
  }
  if (results.loading || classDetail.loading) return <Loading />;
  if (results.error || classDetail.error) return <ErrorNote message={results.error || classDetail.error} onRetry={() => { results.reload(); classDetail.reload(); }} />;

  const data = results.data;
  const currentTerm = data.term || '';
  const currentSession = data.session || '';
  const terms = data.terms || [];

  function changeTerm(event) {
    const next = new URLSearchParams(params);
    next.set('term', event.target.value);
    next.set('session', currentSession);
    setParams(next);
  }

  return (
    <>
      <PageHeader title="Results & timetable" subtitle="View each child's academic progress and weekly schedule." />
      <div className="filters">
        <select className="select" value={selectedId} onChange={(event) => setChildId(Number(event.target.value))}>
          {children.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        {data.terms.length > 0 && (
          <select className="select" value={currentTerm} onChange={changeTerm}>
            {data.terms.filter((item) => item.session === currentSession).map((item) => <option key={item.term}>{item.term}</option>)}
          </select>
        )}
      </div>

      <div className="card">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'results'} className={`tab ${tab === 'results' ? 'active' : ''}`} onClick={() => setTab('results')}>Results</button>
          <button role="tab" aria-selected={tab === 'timetable'} className={`tab ${tab === 'timetable' ? 'active' : ''}`} onClick={() => setTab('timetable')}>Timetable</button>
        </div>

        {tab === 'timetable' && (classDetail.data ? <TimetableGrid timetable={classDetail.data.timetable} /> : <p className="muted">This child has not been placed in a class yet.</p>)}

        {tab === 'results' && (data.terms.length === 0 ? (
          <EmptyState title="No results yet" text="Results will appear here once teachers enter them." />
        ) : (
          <>
            <div className="report-meta">
              <div><span className="muted small">Child</span><div className="strong">{data.student.name}</div></div>
              <div><span className="muted small">Class</span><div className="strong">{data.student.className}</div></div>
              <div><span className="muted small">Term</span><div className="strong">{currentTerm}, {currentSession}</div></div>
            </div>
            {data.results.length === 0 ? <EmptyState title="No scores for this term" text="No subject scores have been entered for this term yet." /> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Subject</th><th className="num">CA</th><th className="num">Exam</th><th className="num">Total</th><th>Grade</th><th>Remark</th></tr></thead>
                  <tbody>{data.results.map((row) => <tr key={row.id}><td className="strong">{row.subject}</td><td className="num">{row.ca}</td><td className="num">{row.exam}</td><td className="num strong">{row.total}</td><td><Badge tone={gradeTone(row.grade)}>{row.grade}</Badge></td><td>{row.remark}</td></tr>)}</tbody>
                </table>
                {data.summary && <div className="summary-strip"><div className="summary-box"><div className="v">{data.summary.average}%</div><div className="l">Average</div></div><div className="summary-box"><div className="v"><Badge tone={gradeTone(data.summary.grade)}>{data.summary.grade}</Badge></div><div className="l">Grade</div></div><div className="summary-box"><div className="v">{data.summary.position || '-'} / {data.summary.outOf}</div><div className="l">Position</div></div></div>}
              </div>
            )}
          </>
        ))}
      </div>
    </>
  );
}