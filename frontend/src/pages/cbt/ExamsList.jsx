import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Search, Clock, Calendar, CheckCircle2, PlayCircle,
  AlertTriangle, Lock, Eye, BarChart3, Users, Sliders, RotateCcw
} from 'lucide-react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { Loading, EmptyState } from '../../components/ui/Feedback.jsx';

export default function ExamsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('2026');
  const [session, setSession] = useState('');
  const [term, setTerm] = useState('');
  const [subject, setSubject] = useState('');
  const [schoolSection, setSchoolSection] = useState('');
  const [status, setStatus] = useState('');

  // Control Modal
  const [controlExam, setControlExam] = useState(null);
  const [controlAction, setControlAction] = useState('open');
  const [controlReason, setControlReason] = useState('');
  const [performingControl, setPerformingControl] = useState(false);

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    loadExams();
  }, [search, year, session, term, subject, schoolSection, status]);

  async function loadMeta() {
    try {
      const res = await api.get('/cbt/meta');
      setMeta(res);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadExams() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (year) params.append('year', year);
      if (session) params.append('session', session);
      if (term) params.append('term', term);
      if (subject) params.append('subject', subject);
      if (schoolSection) params.append('schoolSection', schoolSection);
      if (status) params.append('status', status);

      const res = await api.get(`/cbt/exams?${params.toString()}`);
      setExams(res || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleControlSubmit(e) {
    e.preventDefault();
    if (!controlExam) return;
    setPerformingControl(true);
    try {
      await api.put(`/cbt/exams/${controlExam.id}/control`, {
        action: controlAction,
        reason: controlReason.trim() || `Administrative ${controlAction} command`,
      });
      setControlExam(null);
      setControlReason('');
      loadExams();
    } catch (err) {
      alert(err.message || 'Failed to update examination state');
    } finally {
      setPerformingControl(false);
    }
  }

  const isStaff = user?.role === 'admin' || user?.role === 'teacher';

  return (
    <div className="content">
      <PageHeader
        title={isStaff ? 'CBT Examinations Management' : 'My CBT Examinations'}
        subtitle={
          isStaff
            ? 'Manage computer-based tests, scheduling, attempts, and live controls'
            : 'Access scheduled examinations, take tests, and review performance'
        }
        actions={
          isStaff && (
            <div className="row" style={{ gap: '10px' }}>
              <Link to="/exam-schedule" className="btn btn-outline">
                <Calendar size={16} /> Exam Schedule
              </Link>
              <Link to="/exams/create" className="btn btn-primary">
                <Plus size={16} /> Create CBT Exam
              </Link>
            </div>
          )
        }
      />

      {/* Filter Bar */}
      <div className="cbt-filter-bar">
        <div style={{ position: 'relative', flex: '2', minWidth: '0' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--ink-3)' }} />
          <input
            type="text"
            className="input"
            style={{ paddingLeft: '36px' }}
            placeholder="Search examinations..."
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
          <select className="select" value={schoolSection} onChange={(e) => setSchoolSection(e.target.value)}>
            <option value="">All Sections</option>
            <option value="primary">Primary School</option>
            <option value="jss">Junior Secondary (JSS)</option>
            <option value="sss">Senior Secondary (SSS)</option>
          </select>
        )}

        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="active">Active (Open)</option>
          <option value="scheduled">Scheduled</option>
          <option value="blocked">Blocked</option>
          <option value="closed">Closed</option>
        </select>

        {(search || year !== '2026' || term || subject || schoolSection || status) && (
          <button
            className="btn btn-sm btn-outline"
            onClick={() => {
              setSearch('');
              setYear('2026');
              setTerm('');
              setSubject('');
              setSchoolSection('');
              setStatus('');
            }}
          >
            Reset
          </button>
        )}
      </div>

      {/* Examinations Grid */}
      {loading ? (
        <Loading text="Loading examinations..." />
      ) : exams.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No examinations found"
          body={
            isStaff
              ? 'No examinations found matching your filter criteria. Create a new CBT examination to get started.'
              : 'You do not have any pending or completed examinations for this period.'
          }
          action={
            isStaff && (
              <Link to="/exams/create" className="btn btn-primary">
                <Plus size={16} /> Create Examination
              </Link>
            )
          }
        />
      ) : (
        <div className="cbt-card-grid">
          {exams.map((exam) => {
            const timeInfo = exam.timeInfo || {};
            const isCompleted = exam.myAttempt?.status === 'Submitted' || exam.myAttempt?.status === 'Auto Submitted';
            const isInProgress = exam.myAttempt?.status === 'In Progress';

            return (
              <div
                key={exam.id}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderTop: timeInfo.isOpen
                    ? '4px solid var(--ok)'
                    : timeInfo.timeState === 'blocked'
                    ? '4px solid var(--danger)'
                    : '4px solid var(--primary)',
                }}
              >
                <div>
                  <div className="card-head" style={{ paddingBottom: '12px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <Badge tone="info">{exam.subject}</Badge>
                      <Badge tone="neutral">{exam.className || exam.classLevel}</Badge>
                      <Badge tone="neutral">{exam.year}</Badge>
                    </div>

                    {/* Status Badge */}
                    {timeInfo.timeState === 'blocked' ? (
                      <Badge tone="danger">Blocked</Badge>
                    ) : timeInfo.isOpen ? (
                      <Badge tone="ok">● Active Now</Badge>
                    ) : timeInfo.timeState === 'scheduled' ? (
                      <Badge tone="warn">Scheduled</Badge>
                    ) : (
                      <Badge tone="neutral">Closed</Badge>
                    )}
                  </div>

                  <div style={{ padding: '0 20px' }}>
                    <h3 style={{ fontSize: '18px', marginBottom: '8px', color: 'var(--ink)' }}>
                      {exam.title}
                    </h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13.5px', color: 'var(--ink-2)' }}>
                      <div className="row" style={{ gap: '6px' }}>
                        <Clock size={15} color="var(--primary)" />
                        <span><strong>Duration:</strong> {exam.durationMins} minutes · {exam.numberQuestions} Questions</span>
                      </div>
                      <div className="row" style={{ gap: '6px' }}>
                        <Calendar size={15} color="var(--primary)" />
                        <span><strong>Schedule:</strong> {exam.openingDate} ({exam.openingTime}) — {exam.closingDate} ({exam.closingTime})</span>
                      </div>
                    </div>

                    {/* Student Status Box */}
                    {!isStaff && (
                      <div
                        style={{
                          marginTop: '16px',
                          padding: '12px 14px',
                          background: isCompleted ? 'var(--ok-tint)' : isInProgress ? 'var(--warn-tint)' : '#fdf2f7',
                          borderRadius: '10px',
                          fontSize: '13.5px',
                        }}
                      >
                        {isCompleted ? (
                          <div style={{ color: 'var(--ok)', fontWeight: 600 }}>
                            ✓ Attempt Completed: {exam.myAttempt?.score}/{exam.totalMarks} ({exam.myAttempt?.percentage}%) · Grade {exam.myAttempt?.grade}
                          </div>
                        ) : isInProgress ? (
                          <div style={{ color: 'var(--warn)', fontWeight: 700 }}>
                            ⚠️ Attempt In Progress! Click below to resume your session.
                          </div>
                        ) : timeInfo.isOpen ? (
                          <div style={{ color: 'var(--ok)', fontWeight: 600 }}>
                            Available to take now. 1 attempt permitted.
                          </div>
                        ) : timeInfo.timeState === 'scheduled' ? (
                          <div style={{ color: 'var(--warn)' }}>
                            Opens in: {Math.floor(timeInfo.secondsToOpen / 3600)}h {Math.floor((timeInfo.secondsToOpen % 3600) / 60)}m
                          </div>
                        ) : (
                          <div style={{ color: 'var(--ink-3)' }}>
                            Examination closed.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Foot Actions */}
                <div className="card-foot" style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid var(--line)' }}>
                  {isStaff ? (
                    <div className="row" style={{ justifyContent: 'space-between', width: '100%' }}>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => {
                          setControlExam(exam);
                          setControlAction(timeInfo.isOpen ? 'block' : 'open');
                        }}
                      >
                        <Sliders size={14} /> Control
                      </button>

                      <div className="row" style={{ gap: '8px' }}>
                        <Link to={`/exams/${exam.id}/attempts`} className="btn btn-sm btn-outline" title="Attempts & Overrides">
                          <Users size={14} /> Attempts ({exam.totalAttempts || 0})
                        </Link>
                        <Link to={`/exams/${exam.id}`} className="btn btn-sm btn-primary">
                          <Eye size={14} /> View
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="row" style={{ justifyContent: 'flex-end', width: '100%', gap: '8px' }}>
                      {isCompleted ? (
                        <Link to={`/exams/${exam.id}/results`} className="btn btn-sm btn-outline">
                          <BarChart3 size={15} /> View My Result
                        </Link>
                      ) : isInProgress ? (
                        <Link to={`/exams/${exam.id}/take`} className="btn btn-sm btn-primary" style={{ background: 'var(--warn)', borderColor: 'var(--warn)' }}>
                          <RotateCcw size={15} /> Resume Examination
                        </Link>
                      ) : timeInfo.isOpen ? (
                        <Link to={`/exams/${exam.id}/take`} className="btn btn-sm btn-primary">
                          <PlayCircle size={15} /> Start CBT Exam
                        </Link>
                      ) : (
                        <button className="btn btn-sm btn-outline" disabled>
                          <Lock size={14} /> Not Available
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Staff Examination Control Modal */}
      {controlExam && (
        <Modal title={`Examination Control: ${controlExam.title}`} onClose={() => setControlExam(null)}>
          <form onSubmit={handleControlSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '14px', color: 'var(--ink-2)' }}>
              Change the operational state of this examination. The backend enforces all restrictions in real time.
            </p>

            <div className="form-group">
              <label>Select Control Action</label>
              <select
                className="select"
                value={controlAction}
                onChange={(e) => setControlAction(e.target.value)}
              >
                <option value="open">Open Examination (Active)</option>
                <option value="close">Close Examination</option>
                <option value="block">Temporarily Block Examination</option>
                <option value="unblock">Unblock / Set Scheduled</option>
                <option value="cancel">Cancel Examination</option>
              </select>
            </div>

            <div className="form-group">
              <label>Reason for Action (Recorded in Audit Log) *</label>
              <input
                type="text"
                className="input"
                required
                placeholder="e.g. Schedule adjustment, emergency block, session re-open"
                value={controlReason}
                onChange={(e) => setControlReason(e.target.value)}
              />
            </div>

            <div className="card-foot" style={{ justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-outline" onClick={() => setControlExam(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={performingControl}>
                {performingControl ? 'Applying...' : 'Apply Control'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
