import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Award, Search, BarChart3, Filter, Download, CheckCircle2,
  XCircle, Clock, BookOpen, Layers, Printer
} from 'lucide-react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { Loading, EmptyState } from '../../components/ui/Feedback.jsx';

export default function ExamResults() {
  const { id: routeExamId } = useParams();
  const { user } = useAuth();

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [examId, setExamId] = useState(routeExamId || '');
  const [year, setYear] = useState('2026');
  const [session, setSession] = useState('');
  const [term, setTerm] = useState('');
  const [subject, setSubject] = useState('');
  const [schoolSection, setSchoolSection] = useState('');
  const [classId, setClassId] = useState('');

  // Selected Result Modal (Detailed Report Slip)
  const [selectedResult, setSelectedResult] = useState(null);

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    loadResults();
  }, [search, examId, year, session, term, subject, schoolSection, classId]);

  async function loadMeta() {
    try {
      const res = await api.get('/cbt/meta');
      setMeta(res);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadResults() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (examId) params.append('examId', examId);
      if (year) params.append('year', year);
      if (session) params.append('session', session);
      if (term) params.append('term', term);
      if (subject) params.append('subject', subject);
      if (schoolSection) params.append('schoolSection', schoolSection);
      if (classId) params.append('classId', classId);

      const res = await api.get(`/cbt/results?${params.toString()}`);
      setResults(res.results || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handlePrintSlip() {
    window.print();
  }

  const isStaff = user?.role === 'admin' || user?.role === 'teacher';

  return (
    <div className="content">
      <PageHeader
        title={isStaff ? 'CBT Examination Results Management' : 'My Examination Results'}
        subtitle={
          isStaff
            ? 'Review student scores, performance percentages, letter grades, and printable slips'
            : 'Review your test scores, performance percentage, and official grade records'
        }
        actions={
          isStaff && (
            <div className="row" style={{ gap: '10px' }}>
              <Link to="/generate-position" className="btn btn-primary">
                <Award size={16} /> Generate Positions
              </Link>
            </div>
          )
        }
      />

      {/* Filter Bar */}
      <div className="cbt-filter-bar no-print">
        <div style={{ position: 'relative', flex: '2', minWidth: '220px' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--ink-3)' }} />
          <input
            type="text"
            className="input"
            style={{ paddingLeft: '36px' }}
            placeholder={isStaff ? 'Search student name, ID or exam...' : 'Search exams...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select className="select" value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">All Years</option>
          <option value="2026">2026 Session</option>
          <option value="2025">2025 Session</option>
          <option value="2024">2024 Session</option>
        </select>

        <select className="select" value={term} onChange={(e) => setTerm(e.target.value)}>
          <option value="">All Terms</option>
          <option value="First Term">First Term</option>
          <option value="Second Term">Second Term</option>
          <option value="Third Term">Third Term</option>
          <option value="Final Examination">Final Examination</option>
        </select>

        <select className="select" value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="">All Subjects</option>
          {(meta?.subjects || []).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {isStaff && (
          <>
            <select className="select" value={schoolSection} onChange={(e) => setSchoolSection(e.target.value)}>
              <option value="">All Sections</option>
              <option value="primary">Primary School</option>
              <option value="jss">Junior Secondary</option>
              <option value="sss">Senior Secondary</option>
            </select>

            <select className="select" value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">All Classes</option>
              {(meta?.classes || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </>
        )}

        {(search || year !== '2026' || term || subject || schoolSection || classId || examId) && (
          <button
            className="btn btn-sm btn-outline"
            onClick={() => {
              setSearch('');
              setYear('2026');
              setTerm('');
              setSubject('');
              setSchoolSection('');
              setClassId('');
              setExamId('');
            }}
          >
            Reset
          </button>
        )}
      </div>

      {/* Results Table */}
      {loading ? (
        <Loading text="Loading examination results..." />
      ) : results.length === 0 ? (
        <EmptyState
          icon={Award}
          title="No examination results found"
          body="No completed examination submissions matched your filter criteria."
        />
      ) : (
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Examination Results ({results.length})</h3>
              <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
                Official server-scored examination attempts
              </p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {isStaff && <th>Student Candidate</th>}
                  {isStaff && <th>Class</th>}
                  <th>Examination Title</th>
                  <th>Subject</th>
                  <th>Score / Marks</th>
                  <th>Percentage</th>
                  <th>Grade</th>
                  <th>Submission Mode</th>
                  <th style={{ textAlign: 'right' }}>Slip</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id}>
                    {isStaff && (
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.studentName}</div>
                        <div style={{ fontSize: '12px', color: 'var(--ink-3)' }}>{r.studentSchoolId}</div>
                      </td>
                    )}
                    {isStaff && <td>{r.className}</td>}
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.examTitle}</div>
                      <div style={{ fontSize: '12px', color: 'var(--ink-3)' }}>
                        {r.term} · {r.session}
                      </div>
                    </td>
                    <td>{r.subject}</td>
                    <td>
                      <span style={{ fontWeight: 700, color: 'var(--board)', fontSize: '15px' }}>
                        {r.score}
                      </span>
                      <span style={{ fontSize: '13px', color: 'var(--ink-3)' }}>
                        {' '}/ {r.totalMarks}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontWeight: 700,
                          color: r.percentage >= 65 ? 'var(--ok)' : r.percentage >= 50 ? 'var(--warn)' : 'var(--danger)',
                        }}
                      >
                        {r.percentage}%
                      </span>
                    </td>
                    <td>
                      <Badge tone={r.passed ? 'ok' : 'danger'}>
                        Grade {r.grade}
                      </Badge>
                    </td>
                    <td>
                      <span style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => setSelectedResult(r)}
                      >
                        View Slip
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Official Result Slip Modal */}
      {selectedResult && (
        <Modal title="Official CBT Examination Result Slip" wide onClose={() => setSelectedResult(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header branding on slip */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '16px 20px',
                background: '#fff0f6',
                borderRadius: '12px',
                border: '1.5px solid var(--line-strong)',
              }}
            >
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '12px',
                  background: 'var(--board)',
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                  fontSize: '22px',
                }}
              >
                C
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, color: 'var(--board)', fontSize: '19px' }}>
                  Broad Mind College Examination Council
                </h3>
                <div style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
                  Certified Computer-Based Examination Result Notification
                </div>
              </div>
              <Badge tone={selectedResult.passed ? 'ok' : 'danger'}>
                {selectedResult.passed ? 'PASSED' : 'NEEDS IMPROVEMENT'}
              </Badge>
            </div>

            {/* Candidate & Exam Metadata */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '14px',
                padding: '16px',
                background: '#fffcfd',
                borderRadius: '10px',
                border: '1px solid var(--line)',
                fontSize: '14px',
              }}
            >
              <div>
                <span style={{ color: 'var(--ink-3)', fontSize: '12.5px', display: 'block' }}>Candidate Name:</span>
                <strong>{selectedResult.studentName}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--ink-3)', fontSize: '12.5px', display: 'block' }}>School ID:</span>
                <strong>{selectedResult.studentSchoolId}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--ink-3)', fontSize: '12.5px', display: 'block' }}>Class:</span>
                <strong>{selectedResult.className}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--ink-3)', fontSize: '12.5px', display: 'block' }}>Academic Session:</span>
                <strong>{selectedResult.session} ({selectedResult.term})</strong>
              </div>
              <div>
                <span style={{ color: 'var(--ink-3)', fontSize: '12.5px', display: 'block' }}>Examination:</span>
                <strong>{selectedResult.examTitle}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--ink-3)', fontSize: '12.5px', display: 'block' }}>Subject:</span>
                <strong>{selectedResult.subject}</strong>
              </div>
            </div>

            {/* Performance Analytics Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '14px',
                textAlign: 'center',
              }}
            >
              <div style={{ padding: '16px', background: '#fff0f6', borderRadius: '12px', border: '1px solid var(--line)' }}>
                <div style={{ fontSize: '12px', color: 'var(--ink-3)' }}>Raw Score</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--board)' }}>
                  {selectedResult.score} / {selectedResult.totalMarks}
                </div>
              </div>
              <div style={{ padding: '16px', background: '#fdf2f7', borderRadius: '12px', border: '1px solid var(--line)' }}>
                <div style={{ fontSize: '12px', color: 'var(--ink-3)' }}>Percentage</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary)' }}>
                  {selectedResult.percentage}%
                </div>
              </div>
              <div style={{ padding: '16px', background: '#fdf2f7', borderRadius: '12px', border: '1px solid var(--line)' }}>
                <div style={{ fontSize: '12px', color: 'var(--ink-3)' }}>Grade Letter</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--ink)' }}>
                  {selectedResult.grade}
                </div>
              </div>
              <div style={{ padding: '16px', background: '#fdf2f7', borderRadius: '12px', border: '1px solid var(--line)' }}>
                <div style={{ fontSize: '12px', color: 'var(--ink-3)' }}>Accuracy</div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ok)', marginTop: '6px' }}>
                  {selectedResult.correctCount} Correct · {selectedResult.wrongCount} Wrong
                </div>
              </div>
            </div>

            <div style={{ fontSize: '12.5px', color: 'var(--ink-3)', textAlign: 'center', paddingTop: '8px' }}>
              Timestamp: {new Date(selectedResult.submissionTime).toLocaleString()} · Attempt Code: {selectedResult.attemptCode}
            </div>

            <div className="card-foot" style={{ justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn btn-outline" onClick={() => setSelectedResult(null)}>
                Close
              </button>
              <button className="btn btn-primary" onClick={handlePrintSlip}>
                <Printer size={16} /> Print Official Slip
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
