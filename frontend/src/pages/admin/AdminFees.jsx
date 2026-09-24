import { useState } from 'react';
import { Download, Plus, Search, Trash2, Pencil, Wallet, Banknote, TrendingUp, AlertCircle } from 'lucide-react';
import { api } from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Loading, ErrorNote, EmptyState } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { money, formatDate } from '../../utils/format.js';

const statusTone = { Paid: 'ok', 'Part paid': 'warn', Unpaid: 'danger' };

export default function AdminFees() {
  const toast = useToast();
  const summary = useFetch('/payments/summary');
  const payments = useFetch('/payments');
  const fees = useFetch('/payments/fees');
  const [tab, setTab] = useState('payments');
  const [search, setSearch] = useState('');
  const [recording, setRecording] = useState(null); // the student we are recording a payment for
  const [entry, setEntry] = useState({ feeId: '', amount: '', method: 'Bank transfer' });
  const [newFee, setNewFee] = useState({ title: '', amount: '' });
  const [editingFee, setEditingFee] = useState(null); // { id, title, amount }

  if (summary.loading || payments.loading || fees.loading) return <Loading />;
  const err = summary.error || payments.error || fees.error;
  if (err) return <ErrorNote message={err} onRetry={() => { summary.reload(); payments.reload(); fees.reload(); }} />;

  const { totals, settings } = summary.data;
  const rate = totals.expected ? Math.round((totals.collected / totals.expected) * 100) : 0;
  const q = search.toLowerCase();

  function reloadAll() {
    summary.reload();
    payments.reload();
    fees.reload();
  }

  async function downloadReceipt(p) {
    try {
      await api.download(`/payments/${p.id}/receipt`, `${p.receiptNo}.pdf`);
    } catch (e) {
      toast.error(e.message);
    }
  }

  function openRecord(student) {
    const open = student.fees.filter((f) => f.balance > 0);
    setRecording({ student, open });
    setEntry({ feeId: open[0].id, amount: open[0].balance, method: 'Bank transfer' });
  }

  function chooseFee(feeId) {
    const fee = recording.open.find((f) => f.id === Number(feeId));
    setEntry({ ...entry, feeId: fee.id, amount: fee.balance });
  }

  async function record(e) {
    e.preventDefault();
    try {
      await api.post('/payments/record', { studentId: recording.student.id, ...entry });
      toast.success('Payment recorded');
      setRecording(null);
      reloadAll();
    } catch (er) {
      toast.error(er.message);
    }
  }

  async function addFee(e) {
    e.preventDefault();
    try {
      await api.post('/payments/fees', newFee);
      toast.success('Fee added');
      setNewFee({ title: '', amount: '' });
      reloadAll();
    } catch (er) {
      toast.error(er.message);
    }
  }

  async function removeFee(fee) {
    if (!window.confirm(`Remove "${fee.title}"?`)) return;
    try {
      await api.del(`/payments/fees/${fee.id}`);
      toast.success('Fee removed');
      reloadAll();
    } catch (er) {
      toast.error(er.message);
    }
  }

  async function saveFeeEdit(e) {
    e.preventDefault();
    try {
      await api.put(`/payments/fees/${editingFee.id}`, { title: editingFee.title, amount: editingFee.amount });
      toast.success('Fee updated. Students and parents have been notified.');
      setEditingFee(null);
      reloadAll();
    } catch (er) {
      toast.error(er.message);
    }
  }

  const filteredPayments = payments.data.filter(
    (p) => !q || p.studentName.toLowerCase().includes(q) || p.schoolId.toLowerCase().includes(q) || p.receiptNo.toLowerCase().includes(q)
  );
  const filteredStudents = summary.data.students.filter(
    (s) => !q || s.name.toLowerCase().includes(q) || s.schoolId.toLowerCase().includes(q)
  );

  return (
    <>
      <PageHeader title="Fees and receipts" subtitle={`${settings.term}, ${settings.session}. Track what has been paid and download receipts.`} />

      <div className="grid grid-stats" style={{ marginBottom: 20 }}>
        <StatCard icon={Wallet} label="Expected" value={money(totals.expected)} />
        <StatCard icon={Banknote} label="Collected" value={money(totals.collected)} tone="info" />
        <StatCard icon={AlertCircle} label="Outstanding" value={money(totals.outstanding)} tone="danger" />
        <StatCard icon={TrendingUp} label="Collection rate" value={`${rate}%`} tone="brass">
          <div className="progress" style={{ marginTop: 8 }}><span style={{ width: `${rate}%` }} /></div>
        </StatCard>
      </div>

      <div className="tabs" role="tablist">
        {[['payments', 'Payments and receipts'], ['balances', 'Student balances'], ['items', 'Fee items']].map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab !== 'items' && (
        <div className="filters">
          <div className="search">
            <Search size={17} />
            <input className="input" placeholder="Search by student, ID or receipt" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
          </div>
        </div>
      )}

      {tab === 'payments' && (
        filteredPayments.length === 0 ? (
          <div className="card"><EmptyState icon={Wallet} title="No payments found" /></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Receipt</th><th>Student</th><th>Paid for</th><th className="num">Amount</th><th>Method</th><th>Date</th><th /></tr></thead>
              <tbody>
                {filteredPayments.map((p) => (
                  <tr key={p.id}>
                    <td className="nowrap">{p.receiptNo}</td>
                    <td><div className="strong">{p.studentName}</div><div className="sub small muted">{p.className}</div></td>
                    <td>{p.feeTitle}</td>
                    <td className="num">{money(p.amount)}</td>
                    <td>{p.method}</td>
                    <td className="nowrap">{formatDate(p.date)}</td>
                    <td><div className="actions"><button className="btn btn-outline btn-sm" onClick={() => downloadReceipt(p)}><Download size={15} />Receipt</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'balances' && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Student</th><th>Class</th><th className="num">Paid</th><th className="num">Balance</th><th>Status</th><th /></tr></thead>
            <tbody>
              {filteredStudents.map((s) => (
                <tr key={s.id}>
                  <td><div className="strong">{s.name}</div><div className="sub small muted">{s.schoolId}</div></td>
                  <td>{s.className}</td>
                  <td className="num">{money(s.paid)}</td>
                  <td className="num">{money(s.balance)}</td>
                  <td><Badge tone={statusTone[s.status]}>{s.status}</Badge></td>
                  <td>
                    <div className="actions">
                      {s.balance > 0 && <button className="btn btn-outline btn-sm" onClick={() => openRecord(s)}><Plus size={15} />Record payment</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'items' && (
        <div className="grid split">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Fee</th><th className="num">Amount</th><th /></tr></thead>
              <tbody>
                {fees.data.map((f) => (
                  <tr key={f.id}>
                    <td className="strong">{f.title}</td>
                    <td className="num">{money(f.amount)}</td>
                    <td>
                      <div className="actions">
                        <button className="icon-btn" onClick={() => setEditingFee({ id: f.id, title: f.title, amount: f.amount })} aria-label={`Edit ${f.title}`}><Pencil size={17} /></button>
                        <button className="icon-btn" onClick={() => removeFee(f)} aria-label={`Remove ${f.title}`}><Trash2 size={17} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="strong">Total per student</td>
                  <td className="num strong">{money(fees.data.reduce((sum, f) => sum + f.amount, 0))}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <form className="card" onSubmit={addFee}>
            <div className="card-head"><h3>Add a fee</h3></div>
            <div className="stack" style={{ gap: 14 }}>
              <div className="field"><label htmlFor="fee-title">Fee name</label><input id="fee-title" className="input" value={newFee.title} onChange={(e) => setNewFee({ ...newFee, title: e.target.value })} required /></div>
              <div className="field"><label htmlFor="fee-amount">Amount</label><input id="fee-amount" type="number" min="1" className="input" value={newFee.amount} onChange={(e) => setNewFee({ ...newFee, amount: e.target.value })} required /></div>
              <button className="btn btn-primary">Add fee</button>
            </div>
          </form>
        </div>
      )}

      {editingFee && (
        <Modal title={`Edit ${editingFee.title}`} onClose={() => setEditingFee(null)}>
          <form onSubmit={saveFeeEdit} className="stack" style={{ gap: 14 }}>
            <p className="muted small">Changing this fee updates it for every student this term, and notifies students and parents.</p>
            <div className="field">
              <label htmlFor="e-title">Fee name</label>
              <input id="e-title" className="input" value={editingFee.title} onChange={(e) => setEditingFee({ ...editingFee, title: e.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor="e-amount">Amount</label>
              <input id="e-amount" type="number" min="1" className="input" value={editingFee.amount} onChange={(e) => setEditingFee({ ...editingFee, amount: e.target.value })} required />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditingFee(null)}>Cancel</button>
              <button className="btn btn-primary">Save changes</button>
            </div>
          </form>
        </Modal>
      )}

      {recording && (
        <Modal title={`Record payment for ${recording.student.name}`} onClose={() => setRecording(null)}>
          <form onSubmit={record} className="stack" style={{ gap: 14 }}>
            <p className="muted">Use this for fees paid at the bank or school office.</p>
            <div className="field">
              <label htmlFor="r-fee">Fee</label>
              <select id="r-fee" className="select" value={entry.feeId} onChange={(e) => chooseFee(e.target.value)}>
                {recording.open.map((f) => <option key={f.id} value={f.id}>{f.title} (balance {money(f.balance)})</option>)}
              </select>
            </div>
            <div className="form-grid">
              <div className="field"><label htmlFor="r-amt">Amount</label><input id="r-amt" type="number" min="1" className="input" value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} required /></div>
              <div className="field">
                <label htmlFor="r-method">Method</label>
                <select id="r-method" className="select" value={entry.method} onChange={(e) => setEntry({ ...entry, method: e.target.value })}>
                  <option>Bank transfer</option><option>Cash</option><option>POS</option>
                </select>
              </div>
            </div>
            <div className="form-actions" style={{ marginTop: 4 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setRecording(null)}>Cancel</button>
              <button className="btn btn-primary">Save payment</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
