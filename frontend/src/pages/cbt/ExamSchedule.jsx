import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar, Clock, PlayCircle, Lock, AlertCircle, CheckCircle2,
  Sliders, ArrowRight, ShieldAlert, Sparkles
} from 'lucide-react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Loading, EmptyState } from '../../components/ui/Feedback.jsx';

export default function ExamSchedule() {
  const { user } = useAuth();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [sectionFilter, setSectionFilter] = useState('');

  const isStaff = user?.role === 'admin' || user?.role === 'teacher';

  useEffect(() => {
    loadExams();
    // Live ticking every second for countdown timers
    const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  async function loadExams() {
    setLoading(true);
    try {
      const res = await api.get('/cbt/exams');
      setExams(res || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function formatCountdown(targetMs) {
    const diff = Math.floor((targetMs - currentTime) / 1000);
    if (diff <= 0) return 'Opening Now';
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  const filteredExams = sectionFilter
    ? exams.filter((e) => e.schoolSection === sectionFilter)
    : exams;

  // Categorize exams
  const upcomingExams = [];
  const activeExams = [];
  const pastExams = [];

  filteredExams.forEach((exam) => {
    const startMs = new Date(`${exam.openingDate}T${exam.openingTime || '00:00'}:00`).getTime();
    const endMs = new Date(`${exam.closingDate}T${exam.closingTime || '23:59'}:00`).getTime();

    if (exam.status === 'blocked' || exam.status === 'cancelled') {
      pastExams.push({ ...exam, statusLabel: exam.status.toUpperCase(), startMs, endMs });
    } else if (currentTime < startMs) {
      upcomingExams.push({ ...exam, startMs, endMs });
    } else if (currentTime >= startMs && currentTime <= endMs) {
      activeExams.push({ ...exam, startMs, endMs });
    } else {
      pastExams.push({ ...exam, statusLabel: 'CLOSED', startMs, endMs });
    }
  });

  return (
    <div className="content">
      <PageHeader
        title="Examination Schedule & Timetable"
        subtitle="Real-time access timetable and automated server countdown timers"
        actions={
          isStaff && (
            <Link to="/exams/create" className="btn btn-primary">
              Schedule New Examination
            </Link>
          )
        }
      />

      {/* Section Filter Pills */}
      <div className="row" style={{ gap: '10px', marginBottom: '24px' }}>
        <button
          className={`btn btn-sm ${sectionFilter === '' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSectionFilter('')}
        >
          All School Sections
        </button>
        <button
          className={`btn btn-sm ${sectionFilter === 'primary' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSectionFilter('primary')}
        >
          Primary School (P1 - P5)
        </button>
        <button
          className={`btn btn-sm ${sectionFilter === 'jss' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSectionFilter('jss')}
        >
          Junior Secondary (JSS1 - JSS3)
        </button>
        <button
          className={`btn btn-sm ${sectionFilter === 'sss' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSectionFilter('sss')}
        >
          Senior Secondary (SS1 - SS3)
        </button>
      </div>

      {loading ? (
        <Loading text="Loading examination schedule..." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* Active Now Section */}
          <div>
            <div className="row" style={{ gap: '10px', marginBottom: '14px' }}>
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: 'var(--ok)',
                  boxShadow: '0 0 0 3px rgba(27, 122, 67, 0.25)',
                }}
              />
              <h3 style={{ fontSize: '18px', color: 'var(--ink)' }}>
                Active Examinations ({activeExams.length})
              </h3>
            </div>

            {activeExams.length === 0 ? (
              <div className="card" style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-2)' }}>
                No examinations currently in an active access window.
              </div>
            ) : (
              <div className="cbt-card-grid">
                {activeExams.map((exam) => (
                  <div
                    key={exam.id}
                    className="card"
                    style={{ borderTop: '4px solid var(--ok)', padding: '20px' }}
                  >
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: '12px' }}>
                      <Badge tone="ok">● LIVE NOW</Badge>
                      <span style={{ fontSize: '12.5px', color: 'var(--ink-3)' }}>
                        Duration: {exam.durationMins} mins
                      </span>
                    </div>

                    <h4 style={{ fontSize: '17px', marginBottom: '6px', color: 'var(--ink)' }}>
                      {exam.title}
                    </h4>
                    <div style={{ fontSize: '13.5px', color: 'var(--ink-2)', marginBottom: '16px' }}>
                      {exam.subject} · {exam.className || exam.classLevel}
                    </div>

                    <div
                      style={{
                        padding: '10px 14px',
                        background: '#edfcf2',
                        borderRadius: '10px',
                        marginBottom: '16px',
                        fontSize: '13.5px',
                        color: 'var(--ok)',
                        fontWeight: 600,
                      }}
                    >
                      Time remaining before closing: {formatCountdown(exam.endMs)}
                    </div>

                    <div className="row" style={{ justifyContent: 'flex-end', gap: '10px' }}>
                      <Link to={`/exams/${exam.id}`} className="btn btn-sm btn-outline">
                        Details
                      </Link>
                      {!isStaff ? (
                        <Link to={`/exams/${exam.id}/take`} className="btn btn-sm btn-primary">
                          <PlayCircle size={15} /> Start CBT Exam
                        </Link>
                      ) : (
                        <Link to={`/exams/${exam.id}/attempts`} className="btn btn-sm btn-primary">
                          Monitor Attempts
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Examinations with Countdown */}
          <div>
            <div className="row" style={{ gap: '10px', marginBottom: '14px' }}>
              <Clock size={18} color="var(--primary)" />
              <h3 style={{ fontSize: '18px', color: 'var(--ink)' }}>
                Upcoming Examinations ({upcomingExams.length})
              </h3>
            </div>

            {upcomingExams.length === 0 ? (
              <div className="card" style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-2)' }}>
                No scheduled examinations pending.
              </div>
            ) : (
              <div className="cbt-card-grid">
                {upcomingExams.map((exam) => (
                  <div
                    key={exam.id}
                    className="card"
                    style={{ borderTop: '4px solid var(--primary)', padding: '20px' }}
                  >
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: '12px' }}>
                      <Badge tone="warn">SCHEDULED</Badge>
                      <span style={{ fontSize: '12.5px', color: 'var(--ink-3)' }}>
                        {exam.openingDate} at {exam.openingTime}
                      </span>
                    </div>

                    <h4 style={{ fontSize: '17px', marginBottom: '6px', color: 'var(--ink)' }}>
                      {exam.title}
                    </h4>
                    <div style={{ fontSize: '13.5px', color: 'var(--ink-2)', marginBottom: '16px' }}>
                      {exam.subject} · {exam.className || exam.classLevel}
                    </div>

                    {/* Pre-opening Countdown Box */}
                    <div
                      style={{
                        padding: '12px 14px',
                        background: '#fff0f6',
                        border: '1px solid var(--line-strong)',
                        borderRadius: '10px',
                        marginBottom: '16px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '12px', color: 'var(--ink-3)' }}>Exam opens in:</div>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--board)', fontFamily: 'var(--font-display)' }}>
                        {formatCountdown(exam.startMs)}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--ink-2)', marginTop: '4px' }}>
                        «This examination is not available yet. Please return at the scheduled time.»
                      </div>
                    </div>

                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12.5px', color: 'var(--ink-3)' }}>
                        {exam.numberQuestions} Questions · {exam.durationMins} mins
                      </span>
                      <Link to={`/exams/${exam.id}`} className="btn btn-sm btn-outline">
                        View Schedule
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Past / Closed Examinations */}
          <div>
            <div className="row" style={{ gap: '10px', marginBottom: '14px' }}>
              <Calendar size={18} color="var(--ink-3)" />
              <h3 style={{ fontSize: '18px', color: 'var(--ink)' }}>
                Past / Closed Examinations ({pastExams.length})
              </h3>
            </div>

            <div className="card">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Examination</th>
                      <th>Subject</th>
                      <th>Class Level</th>
                      <th>Closed On</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastExams.map((exam) => (
                      <tr key={exam.id}>
                        <td><strong>{exam.title}</strong></td>
                        <td>{exam.subject}</td>
                        <td>{exam.className || exam.classLevel}</td>
                        <td>{exam.closingDate} {exam.closingTime}</td>
                        <td><Badge tone="neutral">{exam.statusLabel || 'Closed'}</Badge></td>
                        <td style={{ textAlign: 'right' }}>
                          <Link to={`/exams/${exam.id}/results`} className="btn btn-sm btn-outline">
                            View Results
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
