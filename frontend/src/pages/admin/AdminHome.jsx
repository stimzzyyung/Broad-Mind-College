import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, Users, School, MonitorPlay, UserPlus, Megaphone, ArrowRight } from 'lucide-react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import useFetch from '../../hooks/useFetch.js';
import StatCard from '../../components/ui/StatCard.jsx';
import BarList from '../../components/ui/BarList.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Announcements from '../../components/ui/Announcements.jsx';
import { Loading, ErrorNote, EmptyState } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { greeting, shortName, money, formatDate } from '../../utils/format.js';

export default function AdminHome() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useFetch('/dashboard');
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [notice, setNotice] = useState({ title: '', body: '' });

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const rate = data.fees.expected ? Math.round((data.fees.collected / data.fees.expected) * 100) : 0;

  async function postNotice(e) {
    e.preventDefault();
    try {
      await api.post('/dashboard/announcements', notice);
      toast.success('Notice posted');
      setNotice({ title: '', body: '' });
      setNoticeOpen(false);
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function removeNotice(id) {
    if (!window.confirm('Remove this notice?')) return;
    await api.del(`/dashboard/announcements/${id}`);
    toast.success('Notice removed');
    reload();
  }

  return (
    <>
      <section className="hero">
        <div className="hero-inner hero-split">
          <div>
            <h1>{greeting()}, {shortName(user.name)}</h1>
            <p>Here is how the school is doing this term. Fees, classes and results are all one click away.</p>
            <div className="row">
              <Link to="/admin/register-student" className="btn btn-brass"><UserPlus size={17} />Register a student</Link>
              <button className="btn btn-on-dark" onClick={() => setNoticeOpen(true)}><Megaphone size={17} />Post a notice</button>
            </div>
          </div>
          <div className="hero-panel">
            <div style={{ color: '#f5c8dc', fontSize: 14 }}>Fees collected this term</div>
            <div className="big">{money(data.fees.collected)}</div>
            <div className="progress" style={{ margin: '10px 0 6px' }}><span style={{ width: `${rate}%` }} /></div>
            <div style={{ fontSize: 13, color: '#f5c8dc' }}>{rate}% of {money(data.fees.expected)} expected</div>
          </div>
        </div>
      </section>

      <div className="grid grid-stats" style={{ marginBottom: 20 }}>
        <StatCard icon={GraduationCap} label="Students" value={data.counts.students} />
        <StatCard icon={Users} label="Teachers" value={data.counts.teachers} tone="info" />
        <StatCard icon={School} label="Classes" value={data.counts.classes} tone="brass" />
        <StatCard icon={MonitorPlay} label="Quizzes and tests" value={data.counts.quizzes} hint="Created by teachers" />
      </div>

      <div className="grid split">
        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>Students in each class</h3></div>
            <BarList items={data.studentsPerClass.map((c) => ({ label: c.name, value: c.count }))} />
          </div>

          <div className="card card-flush">
            <div className="card-head">
              <h3>Latest payments</h3>
              <Link to="/admin/fees" className="btn btn-ghost btn-sm">All payments <ArrowRight size={15} /></Link>
            </div>
            {data.recentPayments.length === 0 ? (
              <EmptyState title="No payments yet" text="Payments will show here as parents pay fees." />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Student</th><th>Paid for</th><th className="num">Amount</th><th>Date</th></tr></thead>
                  <tbody>
                    {data.recentPayments.map((p) => (
                      <tr key={p.id}>
                        <td className="strong">{p.studentName}</td>
                        <td>{p.feeTitle}</td>
                        <td className="num">{money(p.amount)}</td>
                        <td>{formatDate(p.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h3>Notice board</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setNoticeOpen(true)}>New notice</button>
            </div>
            <Announcements items={data.announcements} onDelete={removeNotice} />
          </div>

          <div className="card">
            <div className="card-head"><h3>Newly registered</h3></div>
            <div className="list">
              {data.recentStudents.map((s) => (
                <div className="list-item" key={s.id}>
                  <div className="avatar avatar-sm">{s.name[0]}</div>
                  <div className="grow">
                    <div className="title">{s.name}</div>
                    <div className="sub">{s.schoolId}</div>
                  </div>
                  <span className="badge badge-neutral">{s.className}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {noticeOpen && (
        <Modal title="Post a notice" onClose={() => setNoticeOpen(false)}>
          <form onSubmit={postNotice} className="stack" style={{ gap: 14 }}>
            <div className="field">
              <label htmlFor="n-title">Title</label>
              <input id="n-title" className="input" value={notice.title} onChange={(e) => setNotice({ ...notice, title: e.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor="n-body">Message</label>
              <textarea id="n-body" className="textarea" value={notice.body} onChange={(e) => setNotice({ ...notice, body: e.target.value })} required />
            </div>
            <div className="form-actions" style={{ marginTop: 4 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setNoticeOpen(false)}>Cancel</button>
              <button className="btn btn-primary">Post notice</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
