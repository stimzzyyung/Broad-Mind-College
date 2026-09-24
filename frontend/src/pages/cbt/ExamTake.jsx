import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Clock, CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight,
  Wifi, WifiOff, Send, HelpCircle, Shield, Award, RotateCcw
} from 'lucide-react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { Loading } from '../../components/ui/Feedback.jsx';

export default function ExamTake() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Core Test State
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState('');
  const [exam, setExam] = useState(null);
  const [student, setStudent] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [attempt, setAttempt] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});

  // Timer & Sync State
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [savingStatus, setSavingStatus] = useState('Saved'); // 'Saving...', 'Saved', 'Error'
  const [autoSubmitting, setAutoSubmitting] = useState(false);

  // Submission Modal
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);

  // References for intervals and sync
  const timerRef = useRef(null);
  const autosaveRef = useRef(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  // 1. Initial Attempt Start or Resume
  useEffect(() => {
    startOrResumeExam();

    const handleOnline = () => {
      setIsOnline(true);
      syncAnswers(answersRef.current);
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(timerRef.current);
      clearInterval(autosaveRef.current);
    };
  }, [id]);

  async function startOrResumeExam() {
    setLoading(true);
    setInitError('');
    try {
      const res = await api.post(`/cbt/exams/${id}/start`);

      if (res.isCompleted) {
        // Attempt was already auto-submitted / completed
        setSubmissionResult({
          attemptId: res.attempt?.id,
          score: res.attempt?.score,
          percentage: res.attempt?.percentage,
          grade: res.attempt?.grade,
          passed: res.attempt?.passed,
          status: res.attempt?.status,
        });
        setLoading(false);
        return;
      }

      setExam(res.exam);
      setStudent(res.student);
      setQuestions(res.questions || []);
      setAttempt(res.attempt);
      setAnswers(res.attempt.savedAnswers || {});
      setRemainingSeconds(res.remainingSeconds);

      // Start countdown timer
      startCountdown(res.remainingSeconds);

      // Start periodic autosave every 15 seconds
      startPeriodicAutosave(res.attempt.id);
    } catch (err) {
      setInitError(err.message || 'Unable to access examination');
    } finally {
      setLoading(false);
    }
  }

  // 2. Client-side countdown ticker (Server remains authority)
  function startCountdown(initialSecs) {
    clearInterval(timerRef.current);
    let current = initialSecs;

    timerRef.current = setInterval(() => {
      current -= 1;
      setRemainingSeconds(current);

      if (current <= 0) {
        clearInterval(timerRef.current);
        triggerAutoSubmit();
      }
    }, 1000);
  }

  // 3. Periodic Background Autosave
  function startPeriodicAutosave(attemptId) {
    clearInterval(autosaveRef.current);
    autosaveRef.current = setInterval(() => {
      syncAnswers(answersRef.current, attemptId);
    }, 15000);
  }

  async function syncAnswers(answersToSave, attemptIdParam) {
    const targetAttemptId = attemptIdParam || attempt?.id;
    if (!targetAttemptId || !navigator.onLine) return;

    setSavingStatus('Saving...');
    try {
      const res = await api.post(`/cbt/attempts/${targetAttemptId}/save`, {
        answers: answersToSave,
      });

      if (res.timeExpired) {
        triggerAutoSubmit();
        return;
      }

      setSavingStatus('Saved');
    } catch (err) {
      setSavingStatus('Offline Cache');
    }
  }

  // Handle selecting an answer option
  function handleSelectOption(opt) {
    const updated = { ...answers, [currentIndex]: opt };
    setAnswers(updated);

    // Continuous autosave immediately for responsiveness
    syncAnswers(updated);
  }

  // Trigger Automatic Submission on time expiry
  async function triggerAutoSubmit() {
    if (autoSubmitting || submitting) return;
    setAutoSubmitting(true);
    setSavingStatus('Auto Submitting...');

    try {
      const res = await api.post(`/cbt/attempts/${attempt?.id}/submit`, {
        answers: answersRef.current,
        autoSubmitted: true,
      });
      setSubmissionResult(res.result);
    } catch (err) {
      alert('Examination time expired. Submitting session.');
    } finally {
      setAutoSubmitting(false);
    }
  }

  // Manual Submission Confirmation
  async function handleManualSubmit() {
    setSubmitting(true);
    try {
      const res = await api.post(`/cbt/attempts/${attempt?.id}/submit`, {
        answers: answersRef.current,
        autoSubmitted: false,
      });
      setSubmitConfirmOpen(false);
      setSubmissionResult(res.result);
    } catch (err) {
      alert(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  // Format seconds to HH:MM:SS or MM:SS
  function formatTime(totalSecs) {
    if (totalSecs === null || totalSecs < 0) return '00:00';
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;

    const pad = (n) => String(n).padStart(2, '0');
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }

  // Render Post-Submission / Completed State
  if (submissionResult) {
    return (
      <div className="fullpage" style={{ padding: '24px', background: 'var(--paper)' }}>
        <div
          className="card"
          style={{
            maxWidth: '560px',
            width: '100%',
            padding: '36px 32px',
            textAlign: 'center',
            boxShadow: '0 8px 30px rgba(122, 20, 64, 0.08)',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'var(--ok-tint)',
              color: 'var(--ok)',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 16px',
            }}
          >
            <CheckCircle2 size={36} />
          </div>

          <h2 style={{ fontSize: '24px', color: 'var(--ink)', marginBottom: '8px' }}>
            Examination Successfully Submitted!
          </h2>
          <p style={{ color: 'var(--ink-2)', fontSize: '14.5px', marginBottom: '24px' }}>
            Your responses have been processed and securely recorded by the school examination server.
          </p>

          <div
            style={{
              padding: '20px',
              background: '#fff9fc',
              border: '1.5px solid var(--line)',
              borderRadius: '14px',
              marginBottom: '24px',
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '16px',
              textAlign: 'left',
            }}
          >
            <div>
              <div style={{ fontSize: '12px', color: 'var(--ink-3)' }}>Total Score</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--board)' }}>
                {submissionResult.score} / {submissionResult.totalMarks || exam?.totalMarks || 100}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '12px', color: 'var(--ink-3)' }}>Percentage</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--primary)' }}>
                {submissionResult.percentage}%
              </div>
            </div>

            <div>
              <div style={{ fontSize: '12px', color: 'var(--ink-3)' }}>Grade Awarded</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink)' }}>
                {submissionResult.grade} ({submissionResult.remark || (submissionResult.passed ? 'Passed' : 'Fail')})
              </div>
            </div>

            <div>
              <div style={{ fontSize: '12px', color: 'var(--ink-3)' }}>Submission Mode</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink-2)', marginTop: '4px' }}>
                {submissionResult.status}
              </div>
            </div>
          </div>

          <div className="row" style={{ justifyContent: 'center', gap: '12px' }}>
            <Link to="/exams" className="btn btn-primary">
              Return to Examinations
            </Link>
            <Link to="/exam-results" className="btn btn-outline">
              View All Results
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Render Access Rejection / Error
  if (initError) {
    return (
      <div className="fullpage" style={{ padding: '24px', background: 'var(--paper)' }}>
        <div className="card" style={{ maxWidth: '480px', padding: '32px', textAlign: 'center' }}>
          <AlertTriangle size={42} color="var(--danger)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ marginBottom: '8px' }}>Examination Access Denied</h3>
          <p style={{ color: 'var(--ink-2)', fontSize: '14px', marginBottom: '20px' }}>{initError}</p>
          <Link to="/exams" className="btn btn-primary">Return to Examinations List</Link>
        </div>
      </div>
    );
  }

  if (loading) return <Loading text="Authenticating examination session..." />;

  const currentQ = questions[currentIndex] || {};
  const currentAnswer = answers[currentIndex];
  const isTimeWarning = remainingSeconds !== null && remainingSeconds < 300; // < 5 mins

  return (
    <div className="cbt-runner">
      {/* Top Sticky Header */}
      <header className="cbt-header">
        <div className="cbt-header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'var(--primary)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                fontSize: '18px',
              }}
            >
              CBT
            </div>
            <div>
              <h2 style={{ fontSize: '17px', color: 'var(--ink)', margin: 0 }}>
                {exam?.title}
              </h2>
              <div style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>
                Candidate: <strong>{student?.name}</strong> ({student?.schoolId}) · Class: {student?.className}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {/* Connection Status */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12.5px',
                color: isOnline ? 'var(--ok)' : 'var(--danger)',
                fontWeight: 600,
              }}
              title={isOnline ? 'Connected to server' : 'Offline. Answers stored locally.'}
            >
              {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
              <span>{isOnline ? savingStatus : 'Offline (Cached)'}</span>
            </div>

            {/* Server-Controlled Countdown Timer */}
            <div className={`cbt-timer-box ${isTimeWarning ? 'warning' : ''}`}>
              <Clock size={18} />
              <span>Time Remaining: {formatTime(remainingSeconds)}</span>
            </div>

            {/* Finish & Submit Button */}
            <button
              className="btn btn-primary"
              style={{ background: 'var(--board)', borderColor: 'var(--board)' }}
              onClick={() => setSubmitConfirmOpen(true)}
            >
              <Send size={15} />
              <span>Submit Exam</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Examination Viewport */}
      <main className="cbt-body-layout">
        {/* Left: Active Question Card & Navigation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="cbt-question-card">
            {/* Question Header */}
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: 'var(--primary-tint)',
                    color: 'var(--board)',
                    fontWeight: 700,
                    fontSize: '13px',
                  }}
                >
                  Question {currentIndex + 1} of {questions.length}
                </span>
                {currentQ.category && (
                  <span style={{ fontSize: '13px', color: 'var(--ink-3)' }}>
                    Topic: {currentQ.category}
                  </span>
                )}
              </div>

              <span style={{ fontWeight: 600, color: 'var(--ink-2)', fontSize: '13px' }}>
                {currentQ.marks || 1} Mark{(currentQ.marks || 1) > 1 ? 's' : ''}
              </span>
            </div>

            {/* Question Statement */}
            <div className="cbt-question-title">
              {currentQ.question}
            </div>

            {/* Answer Options */}
            <div className="cbt-options-grid">
              {(currentQ.options || []).map((opt, optIdx) => {
                const letter = String.fromCharCode(65 + optIdx);
                const isSelected = currentAnswer === opt || currentAnswer === letter;

                return (
                  <button
                    key={optIdx}
                    type="button"
                    className={`cbt-option-btn ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectOption(opt)}
                  >
                    <div className="cbt-option-badge">
                      {letter}
                    </div>
                    <div style={{ flex: 1, fontWeight: isSelected ? 600 : 400 }}>
                      {opt}
                    </div>
                    {isSelected && (
                      <CheckCircle2 size={18} color="var(--primary)" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Next / Previous Controls */}
            <div
              className="row"
              style={{
                justifyContent: 'space-between',
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: '1px solid var(--line)',
              }}
            >
              <button
                className="btn btn-outline"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              >
                <ArrowLeft size={16} /> Previous
              </button>

              <div style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
                {answers[currentIndex] ? '✓ Answered' : 'Unanswered'}
              </div>

              {currentIndex < questions.length - 1 ? (
                <button
                  className="btn btn-primary"
                  onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                >
                  Next <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  style={{ background: 'var(--board)', borderColor: 'var(--board)' }}
                  onClick={() => setSubmitConfirmOpen(true)}
                >
                  Review & Submit <Send size={15} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right: Question Navigation Palette */}
        <aside>
          <div className="cbt-palette-card">
            <h3 style={{ fontSize: '15px', color: 'var(--ink)' }}>Question Palette</h3>
            <p style={{ fontSize: '12px', color: 'var(--ink-3)' }}>
              Click any question number to navigate directly
            </p>

            <div className="cbt-palette-grid">
              {questions.map((q, idx) => {
                const isAnswered = answers[idx] !== undefined && answers[idx] !== null && answers[idx] !== '';
                const isCurrent = currentIndex === idx;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={`cbt-palette-btn ${
                      isCurrent ? 'current' : ''
                    } ${isAnswered ? 'answered' : 'unanswered'}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Palette Legend */}
            <div
              style={{
                marginTop: '20px',
                paddingTop: '14px',
                borderTop: '1px solid var(--line)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '12.5px',
              }}
            >
              <div className="row" style={{ gap: '8px' }}>
                <span style={{ width: '14px', height: '14px', borderRadius: '4px', background: 'var(--primary)' }} />
                <span>Answered ({Object.keys(answers).length})</span>
              </div>
              <div className="row" style={{ gap: '8px' }}>
                <span style={{ width: '14px', height: '14px', borderRadius: '4px', background: '#fff9fc', border: '1px solid var(--line)' }} />
                <span>Unanswered ({Math.max(0, questions.length - Object.keys(answers).length)})</span>
              </div>
              <div className="row" style={{ gap: '8px' }}>
                <span style={{ width: '14px', height: '14px', borderRadius: '4px', outline: '2px solid var(--board)' }} />
                <span>Current Question</span>
              </div>
            </div>

            <div style={{ marginTop: '20px' }}>
              <button
                className="btn btn-outline"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => setSubmitConfirmOpen(true)}
              >
                Submit Examination
              </button>
            </div>
          </div>
        </aside>
      </main>

      {/* Manual Submission Confirmation Modal */}
      {submitConfirmOpen && (
        <Modal title="Confirm Examination Submission" onClose={() => setSubmitConfirmOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '15px', color: 'var(--ink)' }}>
              Are you sure you want to submit this examination? You will not be able to change your answers after submission.
            </p>

            <div
              style={{
                padding: '14px 16px',
                background: '#fff0f6',
                border: '1px solid var(--line-strong)',
                borderRadius: '10px',
                fontSize: '13.5px',
              }}
            >
              <div><strong>Answered Questions:</strong> {Object.keys(answers).length} of {questions.length}</div>
              <div><strong>Unanswered Questions:</strong> {questions.length - Object.keys(answers).length}</div>
              <div><strong>Time Remaining:</strong> {formatTime(remainingSeconds)}</div>
            </div>

            <div className="card-foot" style={{ justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                className="btn btn-outline"
                disabled={submitting}
                onClick={() => setSubmitConfirmOpen(false)}
              >
                Continue Examination
              </button>
              <button
                className="btn btn-primary"
                disabled={submitting}
                onClick={handleManualSubmit}
              >
                {submitting ? 'Submitting Responses...' : 'Yes, Submit Final Answers'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
