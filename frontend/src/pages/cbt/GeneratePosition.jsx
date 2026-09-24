import { useState, useEffect } from 'react';
import { Award, Search, Sparkles, Trophy, Download, Printer, CheckCircle } from 'lucide-react';
import { api } from '../../api/client.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Loading } from '../../components/ui/Feedback.jsx';

export default function GeneratePosition() {
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  // Generation Criteria
  const [year, setYear] = useState('2026');
  const [session, setSession] = useState('2026/2027');
  const [term, setTerm] = useState('First Term');
  const [schoolSection, setSchoolSection] = useState('jss');
  const [classId, setClassId] = useState('');
  const [type, setType] = useState('class'); // 'class', 'subject', 'exam', 'overall'
  const [subject, setSubject] = useState('');

  // Generated Result
  const [positionRecord, setPositionRecord] = useState(null);
  const [pastRecords, setPastRecords] = useState([]);

  useEffect(() => {
    loadMeta();
    loadPastRecords();
  }, []);

  async function loadMeta() {
    setLoading(true);
    try {
      const res = await api.get('/cbt/meta');
      setMeta(res);
      if (res.classes?.length) {
        const jss1 = res.classes.find((c) => c.name.includes('JSS 1')) || res.classes[0];
        setClassId(jss1.id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadPastRecords() {
    try {
      const res = await api.get('/cbt/positions');
      setPastRecords(res || []);
      if (res && res.length > 0 && !positionRecord) {
        setPositionRecord(res[0]);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleGenerate(e) {
    e.preventDefault();
    setGenerating(true);
    setError('');

    try {
      const res = await api.post('/cbt/positions/generate', {
        year,
        session,
        term,
        schoolSection,
        classId: classId ? Number(classId) : null,
        subject: subject || null,
        type,
      });

      setPositionRecord(res);
      loadPastRecords();
    } catch (err) {
      setError(err.message || 'Failed to generate positions. Verify results exist for the chosen class.');
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <Loading text="Loading position generation engine..." />;

  return (
    <div className="content">
      <PageHeader
        title="Student Position & Ranking Engine"
        subtitle="Compute overall, class, subject, and examination positions with automatic tie handling"
        actions={
          positionRecord && (
            <button className="btn btn-outline no-print" onClick={() => window.print()}>
              <Printer size={16} /> Print Ranking Sheet
            </button>
          )
        }
      />

      {/* Generation Parameters Card */}
      <div className="card no-print" style={{ marginBottom: '24px' }}>
        <div className="card-head">
          <div className="row" style={{ gap: '8px' }}>
            <Sparkles size={18} color="var(--primary)" />
            <h3>Configure Ranking Parameters</h3>
          </div>
        </div>

        <form onSubmit={handleGenerate} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div style={{ padding: '12px', background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: '8px', fontSize: '14px' }}>
              {error}
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label>Ranking Scope *</label>
              <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="class">Class Position (Overall in Class)</option>
                <option value="subject">Subject Position (Class by Subject)</option>
                <option value="exam">Specific CBT Exam Position</option>
                <option value="overall">Overall School Section Position</option>
              </select>
            </div>

            <div className="form-group">
              <label>Class *</label>
              <select className="select" value={classId} onChange={(e) => setClassId(e.target.value)}>
                {(meta?.classes || []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {type === 'subject' && (
              <div className="form-group">
                <label>Subject</label>
                <select className="select" value={subject} onChange={(e) => setSubject(e.target.value)}>
                  <option value="">All Subjects</option>
                  {(meta?.subjects || []).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label>School Section</label>
              <select className="select" value={schoolSection} onChange={(e) => setSchoolSection(e.target.value)}>
                <option value="primary">Primary School</option>
                <option value="jss">Junior Secondary</option>
                <option value="sss">Senior Secondary</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Academic Year</label>
              <select className="select" value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="2026">2026</option>
                <option value="2025">2025</option>
                <option value="2024">2024</option>
              </select>
            </div>

            <div className="form-group">
              <label>Session</label>
              <select className="select" value={session} onChange={(e) => setSession(e.target.value)}>
                <option value="2026/2027">2026/2027</option>
                <option value="2025/2026">2025/2026</option>
              </select>
            </div>

            <div className="form-group">
              <label>Term</label>
              <select className="select" value={term} onChange={(e) => setTerm(e.target.value)}>
                <option value="First Term">First Term</option>
                <option value="Second Term">Second Term</option>
                <option value="Third Term">Third Term</option>
                <option value="Final Examination">Final Examination</option>
              </select>
            </div>
          </div>

          <div className="card-foot" style={{ justifyContent: 'flex-end', paddingTop: '12px' }}>
            <button type="submit" className="btn btn-primary" disabled={generating}>
              <Trophy size={16} /> {generating ? 'Computing Positions...' : 'Generate Position Table'}
            </button>
          </div>
        </form>
      </div>

      {/* Generated Position Sheet */}
      {positionRecord && (
        <div className="card">
          <div className="card-head">
            <div>
              <h3>
                {positionRecord.className} {positionRecord.term} Position Table
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
                Session: {positionRecord.session} · Scope: {positionRecord.type?.toUpperCase()} · {positionRecord.totalStudents} Ranked Students
              </p>
            </div>
            <Badge tone="ok">Official Certified Ranking</Badge>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '80px', textAlign: 'center' }}>Position</th>
                  <th>Student Candidate</th>
                  <th>School ID</th>
                  <th>Exams Taken</th>
                  <th>Total Score</th>
                  <th>Average Score</th>
                  <th>Percentage</th>
                  <th>Grade</th>
                </tr>
              </thead>
              <tbody>
                {(positionRecord.rankings || []).map((row, idx) => {
                  const isTop3 = row.rank <= 3;
                  return (
                    <tr
                      key={row.studentId || idx}
                      style={{
                        background:
                          row.rank === 1
                            ? '#fff9db'
                            : row.rank === 2
                            ? '#f8f9fa'
                            : row.rank === 3
                            ? '#fff4e6'
                            : 'transparent',
                      }}
                    >
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className={`cbt-rank-badge ${
                            row.rank === 1
                              ? 'cbt-rank-1'
                              : row.rank === 2
                              ? 'cbt-rank-2'
                              : row.rank === 3
                              ? 'cbt-rank-3'
                              : ''
                          }`}
                        >
                          {row.position}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{row.studentName}</div>
                      </td>
                      <td>
                        <span style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
                          {row.schoolId}
                        </span>
                      </td>
                      <td>{row.examsTaken}</td>
                      <td>
                        <span style={{ fontWeight: 700, color: 'var(--board)', fontSize: '15px' }}>
                          {row.totalScore}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--ink-3)' }}>
                          {' '}/ {row.totalPossible}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{row.average}</span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: row.percentage >= 60 ? 'var(--ok)' : 'var(--warn)' }}>
                          {row.percentage}%
                        </span>
                      </td>
                      <td>
                        <Badge tone={row.percentage >= 50 ? 'ok' : 'danger'}>
                          {row.grade}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            style={{
              padding: '16px 20px',
              borderTop: '1px solid var(--line)',
              fontSize: '12.5px',
              color: 'var(--ink-3)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>Generated on {new Date(positionRecord.generatedAt).toLocaleString()}</span>
            <span>Broad Mind College Examination Council</span>
          </div>
        </div>
      )}
    </div>
  );
}
