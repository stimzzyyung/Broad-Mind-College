import { Link } from 'react-router-dom';
import { Baby, UserPlus, Wallet, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import useFetch from '../../hooks/useFetch.js';
import StatCard from '../../components/ui/StatCard.jsx';
import Announcements from '../../components/ui/Announcements.jsx';
import { Loading, ErrorNote, EmptyState } from '../../components/ui/Feedback.jsx';
import { greeting, shortName, money } from '../../utils/format.js';

export default function ParentHome() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch('/dashboard');

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <h1>{greeting()}, {shortName(user.name)}</h1>
          <p>Keep track of your {data.children.length === 1 ? "child's" : "children's"} school fees, results and lessons, all in one place.</p>
          <div className="row">
            <Link to="/parent/children" className="btn btn-brass"><UserPlus size={17} />Register a child</Link>
            <Link to="/parent/fees" className="btn btn-on-dark"><Wallet size={17} />Pay fees</Link>
          </div>
        </div>
      </section>

      <div className="grid grid-stats" style={{ marginBottom: 20 }}>
        <StatCard icon={Baby} label={data.children.length === 1 ? 'Child' : 'Children'} value={data.children.length} />
        <StatCard icon={Wallet} label="Total outstanding fees" value={money(data.outstanding)} tone={data.outstanding > 0 ? 'danger' : 'primary'} />
      </div>

      <div className="grid split">
        <div className="card card-flush">
          <div className="card-head">
            <h3>Your children</h3>
            <Link to="/parent/children" className="btn btn-ghost btn-sm">Manage <ArrowRight size={15} /></Link>
          </div>
          {data.children.length === 0 ? (
            <EmptyState
              icon={Baby} title="No children registered yet"
              text="Register your child to see their fees, results and lessons here."
              action={<Link to="/parent/children" className="btn btn-primary btn-sm" style={{ marginTop: 8 }}><UserPlus size={16} />Register a child</Link>}
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Name</th><th>Class</th><th className="num">Balance</th><th /></tr></thead>
                <tbody>
                  {data.children.map((c) => (
                    <tr key={c.id}>
                      <td className="strong">{c.name}</td>
                      <td>{c.className}</td>
                      <td className="num">{money(c.balance)}</td>
                      <td className="right">
                        {c.balance > 0
                          ? <Link to="/parent/fees" className="btn btn-outline btn-sm">Pay now</Link>
                          : <span className="badge badge-ok">Fully paid</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h3>Notice board</h3></div>
          <Announcements items={data.announcements} />
        </div>
      </div>
    </>
  );
}
