import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Clock, Calendar, Users, Sliders, PlayCircle,
  RotateCcw, CheckCircle2, Lock, AlertTriangle, BarChart3, HelpCircle
} from 'lucide-react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { Loading } from '../../components/ui/Feedback.jsx';

export default function ExamDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Control Modal
  const [controlAction, setControlAction] = useState('open');
  const [controlModalOpen, setControlModalOpen] = useState(false);
  const [controlReason, setControlReason] = useState('');
  const [performingControl, setPerformingControl] = useState(false);

  // Reschedule Modal
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [openingDate, setOpeningDate] = useState('');
  const [openingTime, setOpeningTime] = useState('');
  const [closingDate, setClosingDate] = useState('');
  const [closingTime, setClosingTime] = useState('');
  const [durationMins, setDurationMins] = useState(60);

  const isStaff = user?.role === 'admin' || user?.role === 'teacher';

  useEffect(() => {
    loadExam();
  }, [id]);

  async function loadExam() {
    setLoading(true);
    try {
      const res = await api.get(`/cbt/exams/${id}`);
      setExam(res);
      setOpeningDate(res.openingDate);
      setOpeningTime(res.openingTime);
      setClosingDate(res.closingDate);
      setClosingTime(res.closingTime);
      setDurationMins(res.durationMins);
    } catch (err) {
      setError(err.message || 'Failed to load examination');
    } finally {
      setLoading(false);
    }
  }

  async function handleControl(action) {
    setPerformingControl(true);
    try {
      await api.put(`/cbt/exams/${id}/control`, {
        action,
        reason: controlReason.trim() || `Administrative ${action} execution`,
      });
      setControlModalOpen(false);
      setControlReason('');
      loadExam();
    } catch (err) {
      alert(err.message || 'Operation failed');
    } finally {
      setPerformingControl(false);
    }
  }

  async function handleReschedule(e) {
    e.preventDefault();
    setPerformingControl(true);
    try {
      await api.put(`/cbt/exams/${id}/control`, {
        action: 'reschedule',
        openingDate,
        openingTime,
        closingDate,
        closingTime,
        durationMins: Number(durationMins),
        reason: 'Rescheduled dates and duration',
      });
      setRescheduleOpen(false);
      loadExam();
    } catch (err) {
      alert(err.message || 'Failed to reschedule');
    } finally {
      setPerformingControl(false);
    }
  }

  if (loading) return <Loading text="Loading examination details..." />;
  if (error || !exam) {
    return (
      <div className="content">
        <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
          <AlertTriangle size={36} color="var(--danger)" style={{ margin: '0 auto 12px' }} />
          <h3>Unable to load examination</h3>
          <p style={{ color: 'var(--ink-2)', marginBottom: '16px' }}>{error}</p>
          <Link to="/exams" className="btn btn-primary">Return to Examinations</Link>
        </div>
      </div>
    );
  }

  const timeInfo = exam.timeInfo || {};

  return (
    <div className="content">
      <PageHeader
        title={exam.title}
        subtitle={`${exam.subject} · ${exam.className || exam.classLevel} · Session ${exam.session}`}
        actions={
          <div className="row" style={{ gap: '10px' }}>
            <Link to="/exams" className="btn btn-outline">
              <ArrowLeft size={16} /> Back to Exams
            </Link>

            {isStaff && (
              <>
                <Link to={`/exams/${id}/attempts`} className="btn btn-outline">
                  <Users size={16} /> Attempts & Overrides
                </Link>
                <Link to={`/exams/${id}/results`} className="btn btn-outline">
                  <BarChart3 size={16} /> Results
                </Link>
                <button
                  className="btn btn-primary"
                  onClick={() => setControlModalOpen(true)}
                >
                  <Sliders size={16} /> Exam Controls
                </button>
              </>
            )}

            {!isStaff && timeInfo.isOpen && !exam.hasActiveAttempt && (
              <Link to={`/exams/${id}/take`} className="btn btn-primary">
                <PlayCircle size={16} /> Start CBT Exam
              </Link>
            )}
            {!isStaff && exam.hasActiveAttempt && (
              <Link to={`/exams/${id}/take`} className="btn btn-primary" style={{ background: 'var(--warn)', borderColor: 'var(--warn)' }}>
                <RotateCcw size={16} /> Resume Examination
              </Link>
            )}
          </div>
        }
      />

      {/* Status & Live Countdown Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          padding: '16px 20px',
          background: timeInfo.isOpen ? '#edfcf2' : timeInfo.timeState === 'blocked' ? '#fff5f5' : '#fff0f6',
          border: '1.5px solid var(--line-strong)',
          borderRadius: '14px',
          marginBottom: '24px',
        }}
      >
        <div className="row" style={{ gap: '12px' }}>
          {timeInfo.isOpen ? (
            <Badge tone="ok">● ACTIVE EXAMINATION</Badge>
          ) : timeInfo.timeState === 'blocked' ? (
            <Badge tone="danger">⚠️ BLOCKED BY ADMIN</Badge>
          ) : timeInfo.timeState === 'scheduled' ? (
            <Badge tone="warn">SCHEDULED</Badge>
          ) : (
            <Badge tone="neutral">EXPIRED / CLOSED</Badge>
          )}

          <span style={{ fontSize: '14.5px', color: 'var(--ink)' }}>
            <strong>Access Window:</strong> {exam.openingDate} ({exam.openingTime}) to {exam.closingDate} ({exam.closingTime})
          </span>
        </div>

        <div>
          {timeInfo.timeState === 'scheduled' ? (
            <span style={{ fontWeight: 700, color: 'var(--warn)', fontSize: '15px' }}>
              Exam opens in: {Math.floor(timeInfo.secondsToOpen / 3600)}h {Math.floor((timeInfo.secondsToOpen % 3600) / 60)}m
            </span>
          ) : timeInfo.isOpen ? (
            <span style={{ fontWeight: 700, color: 'var(--ok)', fontSize: '15px' }}>
              Closing in: {Math.floor(timeInfo.secondsToClose / 3600)}h {Math.floor((timeInfo.secondsToClose % 3600) / 60)}m
            </span>
          ) : (
            <span style={{ color: 'var(--ink-3)', fontSize: '14px' }}>Examination closed</span>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1fr)', gap: '24px' }}>
        {/* Left Column: Examination Details & Questions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card">
            <div className="card-head">
              <h3>Examination Specifications</h3>
            </div>
            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '12.5px', color: 'var(--ink-3)' }}>Subject</div>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>{exam.subject}</div>
              </div>
              <div>
                <div style={{ fontSize: '12.5px', color: 'var(--ink-3)' }}>Class & Section</div>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>{exam.className || exam.classLevel} ({exam.schoolSection?.toUpperCase()})</div>
              </div>
              <div>
                <div style={{ fontSize: '12.5px', color: 'var(--ink-3)' }}>Duration</div>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>{exam.durationMins} Minutes</div>
              </div>
              <div>
                <div style={{ fontSize: '12.5px', color: 'var(--ink-3)' }}>Questions & Marks</div>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>{exam.numberQuestions} Questions · {exam.totalMarks} Marks</div>
              </div>
              <div>
                <div style={{ fontSize: '12.5px', color: 'var(--ink-3)' }}>Allowed Attempts</div>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>{exam.maxAttempts || 1} per student</div>
              </div>
              <div>
                <div style={{ fontSize: '12.5px', color: 'var(--ink-3)' }}>Scoring Method</div>
                <div style={{ fontWeight: 600, fontSize: '15px', textTransform: 'capitalize' }}>{exam.resultCalculationMethod || 'highest'} Score</div>
              </div>
            </div>

            {exam.instructions && (
              <div style={{ padding: '16px 20px', borderTop: '1px solid var(--line)', background: '#fffcfd' }}>
                <strong style={{ fontSize: '13.5px', color: 'var(--board)' }}>Instructions:</strong>
                <p style={{ fontSize: '14px', marginTop: '4px', color: 'var(--ink)' }}>{exam.instructions}</p>
              </div>
            )}
          </div>

          {/* Teacher/Admin Question List View */}
          {isStaff && exam.questions && (
            <div className="card">
              <div className="card-head">
                <div>
                  <h3>Examination Questions ({exam.questions.length})</h3>
                  <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
                    Questions isolated for this examination record
                  </p>
                </div>
              </div>

              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {exam.questions.map((q, idx) => (
                  <div
                    key={q.id || idx}
                    style={{
                      padding: '16px',
                      borderRadius: '12px',
                      border: '1px solid var(--line)',
                      background: '#fff',
                    }}
                  >
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '14px' }}>
                        Question {idx + 1}
                      </span>
                      <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--board)' }}>
                        {q.marks || 1} mark(s)
                      </span>
                    </div>

                    <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '10px' }}>
                      {q.question}
                    </div>

                    {q.options && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                        {q.options.map((opt, optIdx) => {
                          const letter = String.fromCharCode(65 + optIdx);
                          const isCorrect = String(q.correctAnswer) === String(opt) || String(q.correctAnswer) === letter;
                          return (
                            <div
                              key={optIdx}
                              style={{
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: isCorrect ? '2px solid var(--ok)' : '1px solid var(--line)',
                                background: isCorrect ? 'var(--ok-tint)' : '#fff9fc',
                                fontSize: '13px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                              }}
                            >
                              <strong style={{ color: isCorrect ? 'var(--ok)' : 'var(--ink-2)' }}>
                                {letter}.
                              </strong>
                              <span>{opt}</span>
                              {isCorrect && (
                                <span style={{ marginLeft: 'auto', color: 'var(--ok)', fontWeight: 700, fontSize: '11px' }}>
                                  ✓
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Actions, Controls, and Fast Stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {isStaff ? (
            <div className="card">
              <div className="card-head">
                <h3>Live Controls</h3>
              </div>
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                  className="btn btn-outline"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => handleControl(timeInfo.isOpen ? 'close' : 'open')}
                >
                  {timeInfo.isOpen ? 'Force Close Examination' : 'Open Examination Now'}
                </button>

                <button
                  className="btn btn-outline"
                  style={{ width: '100%', justifyContent: 'center', color: timeInfo.timeState === 'blocked' ? 'var(--ok)' : 'var(--danger)' }}
                  onClick={() => handleControl(timeInfo.timeState === 'blocked' ? 'unblock' : 'block')}
                >
                  {timeInfo.timeState === 'blocked' ? 'Unblock Examination' : 'Temporarily Block Exam'}
                </button>

                <button
                  className="btn btn-outline"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => setRescheduleOpen(true)}
                >
                  Reschedule / Change Window
                </button>

                <Link
                  to={`/exams/${id}/attempts`}
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center', marginTop: '6px' }}
                >
                  Manage Student Attempts
                </Link>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-head">
                <h3>Student Portal</h3>
              </div>
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {timeInfo.isOpen ? (
                  exam.hasActiveAttempt ? (
                    <Link to={`/exams/${id}/take`} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', background: 'var(--warn)', borderColor: 'var(--warn)' }}>
                      <RotateCcw size={16} /> Resume In-Progress Attempt
                    </Link>
                  ) : (
                    <Link to={`/exams/${id}/take`} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                      <PlayCircle size={16} /> Start Examination
                    </Link>
                  )
                ) : (
                  <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--ink-2)' }}>
                    <Lock size={24} style={{ margin: '0 auto 8px', color: 'var(--ink-3)' }} />
                    <p style={{ fontSize: '14px' }}>
                      {timeInfo.timeState === 'scheduled'
                        ? 'This examination is not available yet. Please return at the scheduled time.'
                        : 'This examination is currently closed.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Staff Control Modal */}
      {controlModalOpen && (
        <Modal title="Examination Control Center" onClose={() => setControlModalOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '14px', color: 'var(--ink-2)' }}>
              Choose an administrative override command to execute on this examination:
            </p>

            <div className="form-group">
              <label>Action</label>
              <select
                className="select"
                value={controlAction}
                onChange={(e) => setControlAction(e.target.value)}
              >
                <option value="open">Open Examination (Active immediately)</option>
                <option value="close">Close Examination (Terminate student access)</option>
                <option value="block">Temporarily Block Examination</option>
                <option value="unblock">Unblock / Return to Scheduled</option>
                <option value="cancel">Cancel Examination</option>
              </select>
            </div>

            <div className="form-group">
              <label>Reason for Action (Recorded in Audit Log) *</label>
              <input
                type="text"
                className="input"
                required
                placeholder="State your reason for audit compliance"
                value={controlReason}
                onChange={(e) => setControlReason(e.target.value)}
              />
            </div>

            <div className="card-foot" style={{ justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn btn-outline" onClick={() => setControlModalOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={performingControl}
                onClick={() => handleControl(controlAction)}
              >
                {performingControl ? 'Executing...' : 'Apply Action'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reschedule Modal */}
      {rescheduleOpen && (
        <Modal title="Reschedule Examination Window" onClose={() => setRescheduleOpen(false)}>
          <form onSubmit={handleReschedule} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-row">
              <div className="form-group">
                <label>Opening Date</label>
                <input
                  type="date"
                  required
                  className="input"
                  value={openingDate}
                  onChange={(e) => setOpeningDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Opening Time</label>
                <input
                  type="time"
                  required
                  className="input"
                  value={openingTime}
                  onChange={(e) => setOpeningTime(e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Closing Date</label>
                <input
                  type="date"
                  required
                  className="input"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Closing Time</label>
                <input
                  type="time"
                  required
                  className="input"
                  value={closingTime}
                  onChange={(e) => setClosingTime(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Duration (Minutes)</label>
              <input
                type="number"
                min="5"
                max="300"
                required
                className="input"
                value={durationMins}
                onChange={(e) => setDurationMins(Number(e.target.value))}
              />
            </div>

            <div className="card-foot" style={{ justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-outline" onClick={() => setRescheduleOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={performingControl}>
                {performingControl ? 'Updating...' : 'Save Schedule Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
