import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Users, RotateCcw, ShieldCheck, History, Sliders, CheckCircle2,
  AlertTriangle, Lock, Unlock, Search, ArrowLeft, Clock
} from 'lucide-react';
import { api } from '../../api/client.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { Loading, EmptyState } from '../../components/ui/Feedback.jsx';

export default function ExamAttempts() {
  const { id: routeExamId } = useParams();

  const [activeTab, setActiveTab] = useState('attempts'); // 'attempts', 'audit', 'access'
  const [attempts, setAttempts] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [accessLogs, setAccessLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Override Action Modal
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const [overrideAction, setOverrideAction] = useState('RESET_ATTEMPT');
  const [overrideReason, setOverrideReason] = useState('');
  const [performingOverride, setPerformingOverride] = useState(false);
  const [extraMinutes, setExtraMinutes] = useState(15);

  useEffect(() => {
    loadData();
  }, [routeExamId, activeTab]);

  async function loadData() {
    setLoading(true);
    try {
      if (activeTab === 'attempts') {
        const path = routeExamId
          ? `/cbt/exams/${routeExamId}/attempts`
          : '/cbt/exam-attempts';
        const res = await api.get(path);
        setAttempts(res.attempts || res || []);
      } else if (activeTab === 'audit') {
        const res = await api.get('/cbt/audit-logs');
        setAuditLogs(res || []);
      } else if (activeTab === 'access') {
        const path = routeExamId
          ? `/cbt/access-logs?examId=${routeExamId}`
          : '/cbt/access-logs';
        const res = await api.get(path);
        setAccessLogs(res || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleExecuteOverride(e) {
    e.preventDefault();
    if (!selectedAttempt) return;
    if (!overrideReason.trim()) {
      alert('A reason is mandatory for administrative auditing compliance.');
      return;
    }

    setPerformingOverride(true);
    try {
      await api.post(`/cbt/attempts/${selectedAttempt.id}/override`, {
        action: overrideAction,
        reason: overrideReason.trim(),
        extraMinutes: Number(extraMinutes),
      });

      setOverrideModalOpen(false);
      setSelectedAttempt(null);
      setOverrideReason('');
      loadData();
    } catch (err) {
      alert(err.message || 'Override action failed');
    } finally {
      setPerformingOverride(false);
    }
  }

  const filteredAttempts = attempts.filter((att) => {
    if (statusFilter && att.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (
        !att.studentName?.toLowerCase().includes(s) &&
        !att.studentSchoolId?.toLowerCase().includes(s) &&
        !att.attemptCode?.toLowerCase().includes(s)
      ) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="content">
      <PageHeader
        title={routeExamId ? 'Examination Attempts & Security Overrides' : 'Student Attempts Management'}
        subtitle="Manage student examination sessions, handle network interruptions, and execute audited administrative overrides"
        actions={
          routeExamId && (
            <Link to={`/exams/${routeExamId}`} className="btn btn-outline">
              <ArrowLeft size={16} /> Back to Examination
            </Link>
          )
        }
      />

      {/* Tabs */}
      <div className="role-tabs" style={{ maxWidth: '540px', marginBottom: '24px' }}>
        <button
          className={`role-tab ${activeTab === 'attempts' ? 'active' : ''}`}
          onClick={() => setActiveTab('attempts')}
        >
          <Users size={16} /> Candidate Attempts
        </button>
        <button
          className={`role-tab ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          <ShieldCheck size={16} /> Override Audit Log
        </button>
        <button
          className={`role-tab ${activeTab === 'access' ? 'active' : ''}`}
          onClick={() => setActiveTab('access')}
        >
          <History size={16} /> Access History
        </button>
      </div>

      {/* 1. CANDIDATE ATTEMPTS TAB */}
      {activeTab === 'attempts' && (
        <>
          {/* Filters */}
          <div className="cbt-filter-bar">
            <div style={{ position: 'relative', flex: '2', minWidth: '220px' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--ink-3)' }} />
              <input
                type="text"
                className="input"
                style={{ paddingLeft: '36px' }}
                placeholder="Search candidate name or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="In Progress">In Progress (Active)</option>
              <option value="Submitted">Submitted (Manual)</option>
              <option value="Auto Submitted">Auto Submitted (Time Expiry)</option>
              <option value="Unlocked">Unlocked</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          {loading ? (
            <Loading text="Loading candidate attempts..." />
          ) : filteredAttempts.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No attempts recorded"
              body="No student examination attempts found matching your query."
            />
          ) : (
            <div className="card">
              <div className="card-head">
                <h3>Candidate Attempts ({filteredAttempts.length})</h3>
                <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
                  Server-enforced session attempts and override actions
                </p>
              </div>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Attempt Code</th>
                      <th>Student Candidate</th>
                      <th>Examination</th>
                      <th>Attempt #</th>
                      <th>Status</th>
                      <th>Score</th>
                      <th>Start / Activity Time</th>
                      <th style={{ textAlign: 'right' }}>Administrative Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAttempts.map((att) => (
                      <tr key={att.id}>
                        <td>
                          <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                            {att.attemptCode}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{att.studentName}</div>
                          <div style={{ fontSize: '12px', color: 'var(--ink-3)' }}>
                            {att.studentSchoolId} · {att.className}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{att.examTitle}</div>
                          <div style={{ fontSize: '12px', color: 'var(--ink-3)' }}>{att.subject}</div>
                        </td>
                        <td>
                          <Badge tone="neutral">Attempt #{att.attemptNumber || 1}</Badge>
                        </td>
                        <td>
                          <Badge
                            tone={
                              att.status === 'Submitted'
                                ? 'ok'
                                : att.status === 'In Progress'
                                ? 'warn'
                                : att.status === 'Auto Submitted'
                                ? 'info'
                                : 'danger'
                            }
                          >
                            {att.status}
                          </Badge>
                        </td>
                        <td>
                          {att.score !== null && att.score !== undefined ? (
                            <span style={{ fontWeight: 700, color: 'var(--board)' }}>
                              {att.score} ({att.percentage}%) - {att.grade}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--ink-3)' }}>In Session</span>
                          )}
                        </td>
                        <td>
                          <div style={{ fontSize: '12.5px' }}>
                            {att.startTime ? new Date(att.startTime).toLocaleTimeString() : 'N/A'}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--ink-3)' }}>
                            {att.submissionTime ? `Submitted ${new Date(att.submissionTime).toLocaleTimeString()}` : 'Active session'}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => {
                              setSelectedAttempt(att);
                              setOverrideModalOpen(true);
                            }}
                          >
                            <Sliders size={14} /> Override
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* 2. OVERRIDE AUDIT LOG TAB */}
      {activeTab === 'audit' && (
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Administrative Override Audit Log</h3>
              <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
                Immutable historical record of staff override actions and documented justifications
              </p>
            </div>
            <Badge tone="ok">Security Compliant</Badge>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Staff Member</th>
                  <th>Action</th>
                  <th>Student Candidate</th>
                  <th>Examination</th>
                  <th>Reason / Justification</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{log.date}</div>
                      <div style={{ fontSize: '12px', color: 'var(--ink-3)' }}>{log.time}</div>
                    </td>
                    <td>
                      <strong>{log.staffName}</strong>
                    </td>
                    <td>
                      <Badge tone="warn">{log.action}</Badge>
                    </td>
                    <td>
                      <div>{log.studentName}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: '13px' }}>{log.examTitle}</div>
                    </td>
                    <td>
                      <span style={{ fontStyle: 'italic', color: 'var(--ink-2)' }}>
                        «{log.reason}»
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. ACCESS HISTORY TAB */}
      {activeTab === 'access' && (
        <div className="card">
          <div className="card-head">
            <h3>Candidate Access History</h3>
            <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
              Real-time telemetry of login, attempt starts, resume events, and submissions
            </p>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Student</th>
                  <th>Examination</th>
                  <th>Event Action</th>
                  <th>IP Address</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {accessLogs.map((l) => (
                  <tr key={l.id}>
                    <td>{new Date(l.timestamp).toLocaleString()}</td>
                    <td><strong>{l.studentName}</strong></td>
                    <td>{l.examTitle}</td>
                    <td>
                      <Badge tone={l.action.includes('REJECT') ? 'danger' : 'info'}>
                        {l.action}
                      </Badge>
                    </td>
                    <td><span style={{ fontFamily: 'monospace' }}>{l.ipAddress}</span></td>
                    <td><span style={{ fontSize: '13px' }}>{l.details}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Staff Override Execution Modal */}
      {overrideModalOpen && selectedAttempt && (
        <Modal title="Execute Staff Attempt Override" onClose={() => setOverrideModalOpen(false)}>
          <form onSubmit={handleExecuteOverride} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                padding: '12px 14px',
                background: '#fff0f6',
                border: '1px solid var(--line-strong)',
                borderRadius: '10px',
                fontSize: '13.5px',
              }}
            >
              <div><strong>Candidate:</strong> {selectedAttempt.studentName} ({selectedAttempt.studentSchoolId})</div>
              <div><strong>Examination:</strong> {selectedAttempt.examTitle}</div>
              <div><strong>Current Status:</strong> {selectedAttempt.status}</div>
            </div>

            <div className="form-group">
              <label>Select Override Action *</label>
              <select
                className="select"
                value={overrideAction}
                onChange={(e) => setOverrideAction(e.target.value)}
              >
                <option value="RESET_ATTEMPT">Reset Attempt (Clears answers & restarts with fresh time)</option>
                <option value="ALLOW_ANOTHER_ATTEMPT">Allow Another Attempt (Permits retake)</option>
                <option value="UNLOCK_ATTEMPT">Unlock & Extend Time (Adds extra minutes)</option>
                <option value="FORCE_SUBMIT">Force-Submit Session (Finalizes active attempt immediately)</option>
                <option value="CANCEL_ATTEMPT">Cancel Attempt (Invalidates session)</option>
              </select>
            </div>

            {overrideAction === 'UNLOCK_ATTEMPT' && (
              <div className="form-group">
                <label>Extra Time to Grant (Minutes)</label>
                <input
                  type="number"
                  min="5"
                  max="120"
                  className="input"
                  value={extraMinutes}
                  onChange={(e) => setExtraMinutes(e.target.value)}
                />
              </div>
            )}

            <div className="form-group">
              <label>Mandatory Justification / Reason (Recorded in Audit Log) *</label>
              <textarea
                className="textarea"
                rows={3}
                required
                placeholder="State the technical, medical, or administrative reason for this override..."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
            </div>

            <div className="card-foot" style={{ justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setOverrideModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={performingOverride}
              >
                {performingOverride ? 'Recording Audit...' : 'Execute Override'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
