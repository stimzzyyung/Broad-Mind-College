import { Activity, BarChart3, BookOpen, GraduationCap, Megaphone, Users, Wallet } from 'lucide-react';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import BarList from '../../components/ui/BarList.jsx';
import { Loading, ErrorNote, EmptyState } from '../../components/ui/Feedback.jsx';
import { money, formatDate } from '../../utils/format.js';

export default function AdminAnalytics() {
  const { data, loading, error, reload } = useFetch('/analytics');

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const paymentMethods = Object.entries(data.finance.paymentMethods).map(([label, value]) => ({ label, value: Math.round(value) }));
  const maxMonthly = Math.max(...data.finance.monthly.map((item) => item.paid), 1);

  return (
    <>
      <PageHeader title="School analytics" subtitle={`A school-wide view of activity and finance for ${data.settings.term}, ${data.settings.session}.`} />

      <div className="grid grid-stats" style={{ marginBottom: 20 }}>
        <StatCard icon={GraduationCap} label="Students" value={data.overview.students} subtext={`${data.overview.parents} parents linked`} />
        <StatCard icon={Users} label="Teachers" value={data.overview.teachers} subtext={`${data.overview.classes} classes`} tone="info" />
        <StatCard icon={Wallet} label="Fees collected" value={money(data.finance.paid)} subtext={`${data.finance.collectionRate}% collection rate`} tone="ok" />
        <StatCard icon={Activity} label="Outstanding" value={money(data.finance.outstanding)} subtext={`${money(data.finance.expected)} expected`} tone="warn" />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head"><h3>Learning and school activity</h3><Activity size={19} /></div>
          <div className="grid grid-stats">
            <StatCard icon={BookOpen} label="Quizzes" value={data.activity.quizzes} subtext={`${data.activity.quizSubmissions} submissions`} />
            <StatCard icon={BarChart3} label="CBT exams" value={data.activity.exams} subtext={`${data.activity.examAttempts} completed attempts`} tone="info" />
            <StatCard icon={GraduationCap} label="Results entered" value={data.activity.results} subtext="Across all terms" tone="brass" />
            <StatCard icon={Megaphone} label="Notices" value={data.activity.announcements} subtext="Published by the school" tone="ok" />
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Payments by method</h3><Wallet size={19} /></div>
          {paymentMethods.length ? <BarList items={paymentMethods} /> : <EmptyState title="No payments yet" text="Payment method totals will appear here." />}
          {paymentMethods.length > 0 && <div className="small muted" style={{ marginTop: 12 }}>Values shown in naira.</div>}
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head"><h3>Collection by class</h3><span className="small muted">Current term</span></div>
          <div className="table-wrap"><table className="table"><thead><tr><th>Class</th><th className="num">Students</th><th className="num">Collected</th><th className="num">Rate</th></tr></thead><tbody>{data.classes.map((item) => <tr key={item.id}><td className="strong">{item.name}</td><td className="num">{item.students}</td><td className="num">{money(item.paid)}</td><td className="num"><span className={`badge ${item.collectionRate >= 75 ? 'badge-ok' : item.collectionRate >= 40 ? 'badge-warn' : 'badge-danger'}`}>{item.collectionRate}%</span></td></tr>)}</tbody></table></div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Payment trend</h3><span className="small muted">All successful payments</span></div>
          <div className="bars">{data.finance.monthly.map((item) => <div key={item.label} className="bar-row"><span className="bar-label">{item.label}</span><div className="progress"><span style={{ width: `${Math.min((item.paid / maxMonthly) * 100, 100)}%` }} /></div><span className="bar-value">{money(item.paid)}</span></div>)}</div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card card-flush">
          <div className="card-head"><h3>Fee item performance</h3></div>
          <div className="table-wrap"><table className="table"><thead><tr><th>Fee</th><th className="num">Expected</th><th className="num">Paid</th><th className="num">Balance</th></tr></thead><tbody>{data.finance.feeBreakdown.map((fee) => <tr key={fee.id}><td className="strong">{fee.title}</td><td className="num">{money(fee.expected)}</td><td className="num">{money(fee.paid)}</td><td className="num">{money(fee.outstanding)}</td></tr>)}</tbody></table></div>
        </div>
        <div className="card card-flush">
          <div className="card-head"><h3>Recent payments</h3></div>
          {data.recentPayments.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Student</th><th>Fee</th><th className="num">Amount</th><th>Date</th></tr></thead><tbody>{data.recentPayments.map((payment) => <tr key={payment.id}><td className="strong">{payment.studentName}</td><td>{payment.feeTitle}</td><td className="num">{money(payment.amount)}</td><td>{formatDate(payment.date)}</td></tr>)}</tbody></table></div> : <EmptyState title="No payments yet" text="Successful payments will appear here." />}
        </div>
      </div>
    </>
  );
}