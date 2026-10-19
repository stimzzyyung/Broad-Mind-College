import { useState } from 'react';
import { Download, Plus, Search, Trash2, Pencil, Wallet, Banknote, TrendingUp, AlertCircle, Check, Eye, X, FileText, AlertTriangle } from 'lucide-react';
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
  const [paymentFilter, setPaymentFilter] = useState('all'); // all | pending | success | rejected
  const [search, setSearch] = useState('');
  const [recording, setRecording] = useState(null); // student we are recording a payment for
  const [entry, setEntry] = useState({ feeId: '', amount: '', method: 'Bank transfer' });
  const [newFee, setNewFee] = useState({ title: '', amount: '' });
  const [editingFee, setEditingFee] = useState(null); // { id, title, amount }

  // Receipt inspection modal
  const [inspectingPayment, setInspectingPayment] = useState(null);
  const [inspectUrl, setInspectUrl] = useState(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  // Rejection modal
  const [rejectingPayment, setRejectingPayment] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectBusy, setRejectBusy] = useState(false);

  if (summary.loading || payments.loading || fees.loading) return <Loading />;
  const err = summary.error || payments.error || fees.error;
  if (err) return <ErrorNote message={err} onRetry={() => { summary.reload(); payments.reload(); fees.reload(); }} />;

  const { totals, settings } = summary.data;
  const rate = totals.expected ? Math.round((totals.collected / totals.expected) * 100) : 0;
  const q = search.toLowerCase();

  const pendingPaymentsCount = payments.data.filter((p) => p.status === 'pending').length;

  function reloadAll() {
    summary.reload();
    payments.reload();
    fees.reload();
  }

  async function downloadReceipt(p) {
    try {
      await api.download(`/payments/${p.id}/receipt`, `${p.receiptNo || 'receipt'}.pdf`);
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function openReceiptInspection(payment) {
    setInspectingPayment(payment);
    setInspectLoading(true);
    try {
      const url = await api.getBlobUrl(`/payments/${payment.id}/uploaded-receipt`);
      setInspectUrl(url);
    } catch (e) {
      toast.error('Could not load uploaded receipt: ' + e.message);
      setInspectingPayment(null);
    } finally {
      setInspectLoading(false);
    }
  }

  function closeReceiptInspection() {
    if (inspectUrl) {
      URL.revokeObjectURL(inspectUrl);
    }
    setInspectingPayment(null);
    setInspectUrl(null);
  }

  async function confirmTransfer(payment) {
    try {
      await api.post(`/payments/confirm/${payment.id}`);
      toast.success(`Payment of ${money(payment.amount)} for ${payment.studentName} confirmed and marked as Paid`);
      closeReceiptInspection();
      reloadAll();
    } catch (e) {
      toast.error(e.message);
    }
  }

  function openRejectModal(payment) {
    setRejectingPayment(payment);
    setRejectReason('');
  }

  async function submitRejection(e) {
    e.preventDefault();
    if (!rejectingPayment) return;
    setRejectBusy(true);
    try {
      await api.post(`/payments/reject/${rejectingPayment.id}`, { reason: rejectReason.trim() });
      toast.success('Payment receipt rejected and parent has been notified');
      setRejectingPayment(null);
      closeReceiptInspection();
      reloadAll();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setRejectBusy(false);
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

  const filteredPayments = payments.data.filter((p) => {
    if (paymentFilter !== 'all' && p.status !== paymentFilter) return false;
    if (!q) return true;
    return (
      p.studentName?.toLowerCase().includes(q) ||
      p.schoolId?.toLowerCase().includes(q) ||
      p.receiptNo?.toLowerCase().includes(q) ||
      p.reference?.toLowerCase().includes(q) ||
      p.caption?.toLowerCase().includes(q) ||
      p.feeTitle?.toLowerCase().includes(q)
    );
  });

  const filteredStudents = summary.data.students.filter(
    (s) => !q || s.name.toLowerCase().includes(q) || s.schoolId.toLowerCase().includes(q)
  );

  return (
    <>
      <PageHeader
        title="Fees and receipts"
        subtitle={`${settings.term}, ${settings.session}. Review bank transfer receipts, confirm payments, and track balances.`}
      />

      <div className="grid grid-stats" style={{ marginBottom: 20 }}>
        <StatCard icon={Wallet} label="Expected" value={money(totals.expected)} />
        <StatCard icon={Banknote} label="Collected" value={money(totals.collected)} tone="info" />
        <StatCard icon={AlertCircle} label="Outstanding" value={money(totals.outstanding)} tone="danger" />
        <StatCard icon={TrendingUp} label="Collection rate" value={`${rate}%`} tone="brass">
          <div className="progress" style={{ marginTop: 8 }}><span style={{ width: `${rate}%` }} /></div>
        </StatCard>
      </div>

      <div className="tabs" role="tablist">
        {[
          ['payments', `Payments & Receipts ${pendingPaymentsCount > 0 ? `(${pendingPaymentsCount} pending)` : ''}`],
          ['balances', 'Student balances'],
          ['items', 'Fee items'],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab !== 'items' && (
        <div className="filters" style={{ flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="search" style={{ minWidth: 260 }}>
            <Search size={17} />
            <input
              className="input"
              placeholder="Search by student, ID, receipt, or caption"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search"
            />
          </div>

          {tab === 'payments' && (
            <div className="payment-tabs" style={{ marginBottom: 0 }}>
              <button
                type="button"
                className={`payment-pill ${paymentFilter === 'all' ? 'active' : ''}`}
                onClick={() => setPaymentFilter('all')}
              >
                All Payments
              </button>
              <button
                type="button"
                className={`payment-pill ${paymentFilter === 'pending' ? 'active' : ''}`}
                onClick={() => setPaymentFilter('pending')}
              >
                Pending Confirmation
                {pendingPaymentsCount > 0 && <span className="payment-count-badge">{pendingPaymentsCount}</span>}
              </button>
              <button
                type="button"
                className={`payment-pill ${paymentFilter === 'success' ? 'active' : ''}`}
                onClick={() => setPaymentFilter('success')}
              >
                Confirmed / Paid
              </button>
              <button
                type="button"
                className={`payment-pill ${paymentFilter === 'rejected' ? 'active' : ''}`}
                onClick={() => setPaymentFilter('rejected')}
              >
                Rejected
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'payments' && (
        filteredPayments.length === 0 ? (
          <div className="card"><EmptyState icon={Wallet} title="No payments found matching criteria" /></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Student</th>
                  <th>Paid for</th>
                  <th className="num">Amount</th>
                  <th>Method</th>
                  <th>Receipt & Caption</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((p) => (
                  <tr key={p.id}>
                    <td className="nowrap">
                      <div className="strong" style={{ fontSize: 13 }}>{p.receiptNo || p.reference}</div>
                      {p.receiptNo && p.reference && <div className="sub small muted" style={{ fontSize: 11 }}>Ref: {p.reference}</div>}
                    </td>
                    <td>
                      <div className="strong">{p.studentName}</div>
                      <div className="sub small muted">{p.className} · {p.schoolId}</div>
                    </td>
                    <td>{p.feeTitle}</td>
                    <td className="num">{money(p.amount)}</td>
                    <td>{p.method}</td>
                    <td>
                      <div className="stack" style={{ gap: 4 }}>
                        {p.receiptFile ? (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{ padding: '3px 8px', fontSize: 12, width: 'fit-content' }}
                            onClick={() => openReceiptInspection(p)}
                          >
                            <Eye size={12} /> View receipt
                          </button>
                        ) : (
                          <span className="small muted">No upload</span>
                        )}
                        {p.caption && (
                          <div className="caption-bubble" title={p.caption}>
                            <span>💬 "{p.caption}"</span>
                          </div>
                        )}
                        {p.rejectionReason && (
                          <div className="sub small" style={{ color: 'var(--danger)', fontSize: 11 }}>
                            Declined: {p.rejectionReason}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      {p.status === 'success' && <Badge tone="ok">Confirmed</Badge>}
                      {p.status === 'pending' && <Badge tone="warn">Pending Approval</Badge>}
                      {p.status === 'rejected' && <Badge tone="danger">Rejected</Badge>}
                    </td>
                    <td className="nowrap">{formatDate(p.date)}</td>
                    <td>
                      <div className="actions">
                        {p.status === 'pending' ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => confirmTransfer(p)}
                              title="Accept and confirm payment"
                            >
                              <Check size={14} /> Accept & Confirm
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              style={{ color: 'var(--danger)' }}
                              onClick={() => openRejectModal(p)}
                              title="Reject receipt"
                            >
                              <X size={14} /> Reject
                            </button>
                          </>
                        ) : p.status === 'success' ? (
                          <button className="btn btn-outline btn-sm" onClick={() => downloadReceipt(p)}>
                            <Download size={14} /> Receipt
                          </button>
                        ) : null}
                      </div>
                    </td>
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

      {/* Inspect Uploaded Receipt Modal */}
      {inspectingPayment && (
        <Modal title={`Bank Transfer Receipt · ${inspectingPayment.studentName}`} onClose={closeReceiptInspection} wide={true}>
          <div className="stack" style={{ gap: 16 }}>
            <div style={{ background: 'var(--paper)', padding: 14, borderRadius: 10, border: '1px solid var(--line)' }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h4 style={{ fontSize: 16, color: 'var(--ink)' }}>{inspectingPayment.studentName} ({inspectingPayment.className})</h4>
                  <div className="small muted">School ID: {inspectingPayment.schoolId} · Submitted: {formatDate(inspectingPayment.date)}</div>
                  <div style={{ marginTop: 4 }}>
                    <strong>Fee:</strong> {inspectingPayment.feeTitle} · <strong>Amount:</strong> <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{money(inspectingPayment.amount)}</span>
                  </div>
                </div>
                <Badge tone={inspectingPayment.status === 'success' ? 'ok' : inspectingPayment.status === 'pending' ? 'warn' : 'danger'}>
                  {inspectingPayment.status === 'success' ? 'Confirmed (Paid)' : inspectingPayment.status === 'pending' ? 'Pending Admin Approval' : 'Rejected'}
                </Badge>
              </div>

              {inspectingPayment.caption && (
                <div style={{ marginTop: 10, padding: 10, background: '#fff', borderRadius: 8, border: '1px solid var(--line)' }}>
                  <div className="small muted" style={{ fontWeight: 600, marginBottom: 2 }}>Caption from Parent:</div>
                  <div style={{ color: 'var(--ink)', fontSize: 14 }}>"{inspectingPayment.caption}"</div>
                </div>
              )}
            </div>

            {inspectLoading ? (
              <Loading />
            ) : inspectUrl ? (
              <div style={{ textAlign: 'center', background: '#fafafa', padding: 16, borderRadius: 10, border: '1px solid var(--line)' }}>
                {inspectingPayment.receiptMime === 'application/pdf' || inspectingPayment.receiptOriginalName?.endsWith('.pdf') ? (
                  <div className="stack" style={{ alignItems: 'center', padding: 24, gap: 12 }}>
                    <FileText size={48} color="var(--danger)" />
                    <div className="strong">{inspectingPayment.receiptOriginalName || 'Bank Transfer Receipt PDF'}</div>
                    <a href={inspectUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
                      <Download size={14} /> Open or Download PDF
                    </a>
                  </div>
                ) : (
                  <div>
                    <img src={inspectUrl} alt="Bank Transfer Receipt" className="receipt-viewer-img" />
                    <div style={{ marginTop: 10 }}>
                      <a href={inspectUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                        Open in new window
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            <div className="form-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <button type="button" className="btn btn-ghost" onClick={closeReceiptInspection}>Close</button>
              {inspectingPayment.status === 'pending' && (
                <div className="row" style={{ gap: 10 }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => {
                      const p = inspectingPayment;
                      closeReceiptInspection();
                      openRejectModal(p);
                    }}
                  >
                    <X size={15} /> Reject
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => confirmTransfer(inspectingPayment)}
                  >
                    <Check size={16} /> Accept & Confirm Payment
                  </button>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Payment Modal */}
      {rejectingPayment && (
        <Modal title="Reject Bank Transfer Receipt" onClose={() => setRejectingPayment(null)}>
          <form onSubmit={submitRejection} className="stack" style={{ gap: 14 }}>
            <p className="muted small">
              You are rejecting the payment of <strong>{money(rejectingPayment.amount)}</strong> for <strong>{rejectingPayment.studentName}</strong>. The parent will be notified and the fee will remain unpaid.
            </p>
            <div className="field">
              <label htmlFor="reject-reason">Reason for rejection (Optional)</label>
              <textarea
                id="reject-reason"
                className="textarea"
                rows={3}
                placeholder="e.g. Receipt image is unclear / Funds not received on bank statement / Amount does not match"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setRejectingPayment(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ background: 'var(--danger)' }} disabled={rejectBusy}>
                {rejectBusy ? 'Rejecting…' : 'Confirm Rejection'}
              </button>
            </div>
          </form>
        </Modal>
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
