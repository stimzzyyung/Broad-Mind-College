import { useState } from 'react';
import { Download, Wallet, Baby } from 'lucide-react';
import { api } from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Loading, ErrorNote, EmptyState } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { money, formatDate } from '../../utils/format.js';

const TONE = { Paid: 'ok', 'Part paid': 'warn', Unpaid: 'danger' };

export default function ParentFees() {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch('/payments/children');
  const [payFee, setPayFee] = useState(null); // { child, fee }
  const [method, setMethod] = useState('Card');
  const [amount, setAmount] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState('');

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  function openPay(child, fee) {
    setPayFee({ child, fee });
    setAmount(String(fee.balance));
    setMethod('Card');
    setCardNumber('');
    setPayError('');
  }

  async function submitPayment(e) {
    e.preventDefault();
    setPayError('');
    setBusy(true);
    try {
      await api.post('/payments/pay-child', {
        studentId: payFee.child.id, feeId: payFee.fee.id, amount: Number(amount), method, cardNumber,
      });
      toast.success(`Payment for ${payFee.child.name}'s ${payFee.fee.title} was successful`);
      setPayFee(null);
      reload();
    } catch (err) {
      setPayError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadReceipt(payment) {
    try {
      await api.download(`/payments/${payment.id}/receipt`, `${payment.receiptNo}.pdf`);
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (data.children.length === 0) {
    return (
      <>
        <PageHeader title="Fees & receipts" subtitle="Pay your children's school fees and download receipts." />
        <div className="card">
          <EmptyState icon={Baby} title="No children registered yet" text="Register a child first, then their fees will show up here." />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Fees & receipts" subtitle={`${data.settings.term}, ${data.settings.session}`} />

      <div className="stack" style={{ marginBottom: 20 }}>
        {data.children.map((child) => (
          <div className="card" key={child.id}>
            <div className="card-head">
              <h3>{child.name}</h3>
              <span className="muted small">{child.className}</span>
            </div>
            <div className="summary-strip">
              <div className="summary-box"><div className="v">{money(child.totals.expected)}</div><div className="l">Expected this term</div></div>
              <div className="summary-box"><div className="v">{money(child.totals.paid)}</div><div className="l">Paid so far</div></div>
              <div className="summary-box"><div className="v">{money(child.totals.balance)}</div><div className="l">Balance</div></div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Fee</th><th className="num">Amount</th><th className="num">Balance</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {child.fees.map((fee) => (
                    <tr key={fee.id}>
                      <td className="strong">{fee.title}</td>
                      <td className="num">{money(fee.amount)}</td>
                      <td className="num">{money(fee.balance)}</td>
                      <td><Badge tone={TONE[fee.status]}>{fee.status}</Badge></td>
                      <td className="right">
                        {fee.balance > 0 && (
                          <button className="btn btn-primary btn-sm" onClick={() => openPay(child, fee)}>
                            <Wallet size={14} />Pay
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="card card-flush">
        <div className="card-head"><h3>Payment history</h3></div>
        {data.payments.length === 0 ? (
          <EmptyState title="No payments yet" text="Payments you make for your children will appear here." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Child</th><th>Paid for</th><th className="num">Amount</th><th>Method</th><th>Date</th><th /></tr></thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="strong">{p.studentName}</td>
                    <td>{p.feeTitle}</td>
                    <td className="num">{money(p.amount)}</td>
                    <td>{p.method}</td>
                    <td>{formatDate(p.date)}</td>
                    <td className="right">
                      <button className="btn btn-ghost btn-sm" onClick={() => downloadReceipt(p)}><Download size={14} />Receipt</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {payFee && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setPayFee(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Pay fee">
            <div className="modal-head">
              <h3>Pay {payFee.fee.title}</h3>
              <button className="icon-btn" onClick={() => setPayFee(null)} aria-label="Close">✕</button>
            </div>
            <form onSubmit={submitPayment} className="stack" style={{ gap: 14 }}>
              <p className="muted small">For {payFee.child.name}. Balance on this fee: {money(payFee.fee.balance)}.</p>
              <div className="field">
                <label htmlFor="amt">Amount to pay</label>
                <input id="amt" type="number" min="1" max={payFee.fee.balance} className="input" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="method">Payment method</label>
                <select id="method" className="select" value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option>Card</option>
                  <option>Bank transfer</option>
                  <option>USSD</option>
                </select>
              </div>
              {method === 'Card' && (
                <div className="field">
                  <label htmlFor="card">Card number</label>
                  <input id="card" className="input" placeholder="4111 1111 1111 1111" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} required />
                </div>
              )}
              <p className="hint">This is a demo payment — no real money moves. A real deployment would connect a gateway like Paystack, Flutterwave or Stripe here.</p>
              {payError && <div className="error-note" role="alert">{payError}</div>}
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setPayFee(null)}>Cancel</button>
                <button className="btn btn-primary" disabled={busy}><Wallet size={17} />{busy ? 'Paying…' : `Pay ${money(amount || 0)}`}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
