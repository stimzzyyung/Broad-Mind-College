import { useEffect, useState } from 'react';
import { Save, Award } from 'lucide-react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import BarList from '../../components/ui/BarList.jsx';
import { Loading, ErrorNote, EmptyState } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { gradeTone } from '../../utils/format.js';
import { TERMS, sessionOptions, lastTerm } from '../../utils/terms.js';

export default function TeacherResults() {
  const { user, settings } = useAuth();
  const toast = useToast();
  const classes = useFetch('/classes');
  const [tab, setTab] = useState('enter');
  const [classId, setClassId] = useState('');
  const [subject, setSubject] = useState('');
  const start = lastTerm(settings);
  const [term, setTerm] = useState(settings.term);
  const [session, setSession] = useState(settings.session);
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const detail = useFetch(classId ? `/classes/${classId}` : null);
  const mySubjects = detail.data ? detail.data.subjects.filter((s) => s.teacherId === user.id) : [];

  // Reset the chosen subject if it is no longer valid for the newly chosen class
  useEffect(() => {
    if (detail.data && !mySubjects.some((s) => s.name === subject)) {
      setSubject(mySubjects[0] ? mySubjects[0].name : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data]);

  const scores = useFetch(
    classId && subject
      ? `/results?classId=${classId}&subject=${encodeURIComponent(subject)}&term=${encodeURIComponent(term)}&session=${encodeURIComponent(session)}`
      : null
  );
  const summary = useFetch(
    tab === 'summary' && classId
      ? `/results/class-summary?classId=${classId}&term=${encodeURIComponent(term)}&session=${encodeURIComponent(session)}`
      : null
  );

  // Build the editable grid whenever the class, students or saved scores change
  useEffect(() => {
    if (detail.data && scores.data) {
      setRows(
        detail.data.students.map((s) => {
          const found = scores.data.find((r) => r.studentId === s.id);
          return { studentId: s.id, name: s.name, schoolId: s.schoolId, ca: found ? found.ca : '', exam: found ? found.exam : '' };
        })
      );
    }
  }, [detail.data, scores.data]);

  if (classes.loading) return <Loading />;
  if (classes.error) return <ErrorNote message={classes.error} onRetry={classes.reload} />;

  function updateRow(studentId, field, value) {
    setRows(rows.map((r) => (r.studentId === studentId ? { ...r, [field]: value } : r)));
  }

  async function save() {
    setError('');
    setSaving(true);
    try {
      await api.post('/results/bulk', { classId, subject, term, session, scores: rows });
      toast.success('Scores saved');
      scores.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Enter results" subtitle="Save scores for a class and subject, or check the class ranking." />

      <div className="filters">
        <select className="select" value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class">
          <option value="">Choose a class…</option>
          {classes.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {tab === 'enter' && (
          <select className="select" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" disabled={!classId}>
            <option value="">Choose a subject…</option>
            {mySubjects.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        )}
        <select className="select" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Term">
          {TERMS.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select className="select" value={session} onChange={(e) => setSession(e.target.value)} aria-label="Session">
          {sessionOptions(settings.session).map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="tabs" role="tablist">
        {[['enter', 'Enter scores'], ['summary', 'Class summary']].map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'enter' && (
        !classId || !subject ? (
          <div className="card"><EmptyState icon={Award} title="Choose a class and subject" text="Pick a class and one of your subjects above to enter scores." /></div>
        ) : scores.loading || detail.loading ? (
          <Loading />
        ) : (
          <div className="card card-flush">
            <div className="card-head">
              <h3>{subject} — {classes.data.find((c) => String(c.id) === String(classId)).name}</h3>
              <span className="muted small">CA is out of 40, exam is out of 60</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Student</th><th style={{ width: 110 }}>CA (/40)</th><th style={{ width: 110 }}>Exam (/60)</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.studentId}>
                      <td><div className="strong">{r.name}</div><div className="sub small muted">{r.schoolId}</div></td>
                      <td><input type="number" min="0" max="40" className="input score-input" value={r.ca} onChange={(e) => updateRow(r.studentId, 'ca', e.target.value)} /></td>
                      <td><input type="number" min="0" max="60" className="input score-input" value={r.exam} onChange={(e) => updateRow(r.studentId, 'exam', e.target.value)} /></td>
                      <td className="num strong">{r.ca !== '' && r.exam !== '' ? Number(r.ca) + Number(r.exam) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error && <div className="error-note" role="alert" style={{ margin: '14px 20px 0' }}>{error}</div>}
            <div className="form-actions" style={{ padding: '0 20px 20px' }}>
              <button className="btn btn-primary" onClick={save} disabled={saving}><Save size={17} />{saving ? 'Saving…' : 'Save scores'}</button>
            </div>
          </div>
        )
      )}

      {tab === 'summary' && (
        !classId ? (
          <div className="card"><EmptyState icon={Award} title="Choose a class" text="Pick a class above to see its ranking." /></div>
        ) : summary.loading ? (
          <Loading />
        ) : summary.error ? (
          <ErrorNote message={summary.error} onRetry={summary.reload} />
        ) : summary.data.ranking.length === 0 ? (
          <div className="card"><EmptyState icon={Award} title="No results yet" text="No scores have been entered for this class, term and session." /></div>
        ) : (
          <div className="grid split">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Position</th><th>Student</th><th className="num">Total</th><th className="num">Average</th><th>Grade</th></tr></thead>
                <tbody>
                  {summary.data.ranking.map((r) => (
                    <tr key={r.id}>
                      <td className="strong">{r.position}</td>
                      <td>{r.name}</td>
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
        )
      )}
    </>
  );
}
