import { useState, useEffect } from 'react';
import {
  BarChart3, Award, Users, CheckCircle, TrendingUp,
  Printer, ArrowUpRight, BookOpen, Layers, ShieldCheck
} from 'lucide-react';
import { api } from '../../api/client.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Loading } from '../../components/ui/Feedback.jsx';

export default function ExamReports() {
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    setLoading(true);
    try {
      const res = await api.get('/cbt/reports');
      setReports(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <Loading text="Compiling CBT performance reports..." />;
  if (!reports) return null;

  const { metrics, subjectPerformance, sectionBreakdown, recentAttempts } = reports;

  return (
    <div className="content">
      <PageHeader
        title="Examination Performance Reports & Analytics"
        subtitle="Institutional CBT analytics across Primary, Junior Secondary, and Senior Secondary sections"
        actions={
          <button className="btn btn-outline no-print" onClick={() => window.print()}>
            <Printer size={16} /> Print Reports
          </button>
        }
      />

      {/* Metrics Row */}
      <div className="stat-grid" style={{ marginBottom: '24px' }}>
        <StatCard
          icon={BookOpen}
          label="Total Examinations"
          value={metrics.totalExams}
          subtext={`${metrics.activeExams} Active · ${metrics.scheduledExams} Scheduled`}
        />
        <StatCard
          icon={Users}
          label="Students Tested"
          value={metrics.uniqueStudents}
          subtext={`${metrics.totalAttempts} Total Attempt Sessions`}
        />
        <StatCard
          icon={TrendingUp}
          label="Overall Pass Rate"
          value={`${metrics.passRate}%`}
          subtext={`Based on 50% pass mark standard`}
        />
        <StatCard
          icon={Award}
          label="Institutional Average"
          value={`${metrics.averagePercentage}%`}
          subtext="Mean student score"
        />
      </div>

      <div className="cbt-builder-layout" style={{ marginBottom: '24px' }}>
        {/* Subject Performance Breakdown */}
        <div className="card">
          <div className="card-head">
            <h3>Subject Performance Breakdown</h3>
            <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
              Comparative pass rates and average scores across curriculum subjects
            </p>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Attempts</th>
                  <th>Average Score</th>
                  <th>Pass Rate</th>
                </tr>
              </thead>
              <tbody>
                {subjectPerformance.map((sub) => (
                  <tr key={sub.subject}>
                    <td><strong>{sub.subject}</strong></td>
                    <td>{sub.attempts} candidate(s)</td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{sub.averagePercent}%</span>
                    </td>
                    <td>
                      <div className="row" style={{ gap: '10px' }}>
                        <div
                          style={{
                            width: '100px',
                            height: '8px',
                            borderRadius: '4px',
                            background: 'var(--line)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${sub.passRate}%`,
                              height: '100%',
                              background: sub.passRate >= 70 ? 'var(--ok)' : sub.passRate >= 50 ? 'var(--warn)' : 'var(--danger)',
                            }}
                          />
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '13px' }}>
                          {sub.passRate}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section Distribution */}
        <div className="card">
          <div className="card-head">
            <h3>School Section Coverage</h3>
            <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
              Examination distribution across school tiers
            </p>
          </div>

          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {sectionBreakdown.map((sec) => (
              <div
                key={sec.code}
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1px solid var(--line)',
                  background: '#fff9fc',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--ink)' }}>{sec.section}</h4>
                  <div style={{ fontSize: '12.5px', color: 'var(--ink-3)' }}>
                    {sec.code === 'primary' ? 'Primary 1 to Primary 5' : sec.code === 'jss' ? 'JSS1 to JSS3' : 'SS1 to SS3'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--board)' }}>
                    {sec.exams}
                  </span>
                  <div style={{ fontSize: '11px', color: 'var(--ink-3)' }}>Exams</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Examination Activity */}
      <div className="card">
        <div className="card-head">
          <h3>Recent Certified Submissions</h3>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                <th>School ID</th>
                <th>Examination</th>
                <th>Score</th>
                <th>Percentage</th>
                <th>Grade</th>
                <th>Date / Time</th>
              </tr>
            </thead>
            <tbody>
              {recentAttempts.map((att) => (
                <tr key={att.id}>
                  <td><strong>{att.studentName}</strong></td>
                  <td>{att.studentSchoolId}</td>
                  <td>{att.examTitle} ({att.subject})</td>
                  <td>
                    <span style={{ fontWeight: 700, color: 'var(--board)' }}>
                      {att.score} / {att.totalMarks}
                    </span>
                  </td>
                  <td>{att.percentage}%</td>
                  <td>
                    <Badge tone={att.percentage >= 50 ? 'ok' : 'danger'}>
                      {att.grade}
                    </Badge>
                  </td>
                  <td>{new Date(att.submissionTime).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
