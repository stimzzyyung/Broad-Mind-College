import { useEffect, useState } from 'react';
import { Download, Wallet } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Loading, ErrorNote, EmptyState } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { money, formatDate } from '../../utils/format.js';

const TONE = { Paid: 'ok', 'Part paid': 'warn', Unpaid: 'danger' };

export default function StudentFees() {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch('/payments/my');
  const [params, setParams] = useSearchParams();
  const [payFee, setPayFee] = useState(null);
  const [amount, setAmount] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState('');
  const reference = params.get('reference');

  useEffect(() => {
    if (!reference) return;
    let cancelled = false;
    api.get(`/payments/korapay/verify/${encodeURIComponent(reference)}`)
      .then(() => {
        if (cancelled) return;
        toast.success('Korapay payment confirmed');
        setParams((next) => { next.delete('reference'); return next; }, { replace: true });
        reload();
      })
      .catch((err) => !cancelled && toast.error(err.message))
      .finally(() => { cancelled = true; });
    return () => { cancelled = true; };
  }, [reference, reload, setParams, toast]);

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  function openPay(fee) {
    setPayFee(fee);
    setAmount(String(fee.balance));
    setEmail('');
    setPayError('');
  }

  async function submitPayment(e) {
    e.preventDefault();
    setPayError('');
    setBusy(true);
    try {
      const result = await api.post('/payments/korapay/initialize', {
        feeId: payFee.id,
        amount: Number(amount),
        email,
      });
      window.location.assign(result.checkoutUrl);
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

  return (
    <>
      <PageHeader title="Fees & receipts" subtitle={`${data.settings.term}, ${data.settings.session}`} />
      {!data.paymentOptions.korapayConfigured && (
        <div className="error-note" role="status">Online payments are not configured. Please contact the school office.</div>
      )}

      <div className="summary-strip">
        <div className="summary-box"><div className="v">{money(data.totals.expected)}</div><div className="l">Expected this term</div></div>
        <div className="summary-box"><div className="v">{money(data.totals.paid)}</div><div className="l">Paid so far</div></div>
        <div className="summary-box"><div className="v">{money(data.totals.balance)}</div><div className="l">Balance</div></div>
      </div>

      <div className="card card-flush" style={{ marginBottom: 20 }}>
        <div className="card-head"><h3>Fee items</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Fee</th><th className="num">Amount</th><th className="num">Balance</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.fees.map((fee) => (
                <tr key={fee.id}>
                  <td className="strong">{fee.title}</td>
                  <td className="num">{money(fee.amount)}</td>
                  <td className="num">{money(fee.balance)}</td>
                  <td><Badge tone={TONE[fee.status]}>{fee.status}</Badge></td>
                  <td className="right">
                    {fee.balance > 0 && (
                      <button className="btn btn-primary btn-sm" onClick={() => openPay(fee)} disabled={!data.paymentOptions.korapayConfigured}><Wallet size={14} />Pay</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card card-flush">
        <div className="card-head"><h3>Payment history</h3></div>
        {data.payments.length === 0 ? (
          <EmptyState title="No payments yet" text="Payments you make will appear here, with a downloadable receipt." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Paid for</th><th className="num">Amount</th><th>Method</th><th>Date</th><th /></tr></thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="strong">{p.feeTitle}</td>
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
              <h3>Pay {payFee.title}</h3>
              <button className="icon-btn" onClick={() => setPayFee(null)} aria-label="Close">✕</button>
            </div>
            <form onSubmit={submitPayment} className="stack" style={{ gap: 14 }}>
              <p className="muted small">Balance on this fee: {money(payFee.balance)}.</p>
              <div className="field">
                <label htmlFor="amt">Amount to pay</label>
                <input id="amt" type="number" min="1" max={payFee.balance} className="input" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="payment-email">Email for Korapay receipt</label>
                <input id="payment-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <p className="hint">You will be redirected to Korapay to complete your payment securely.</p>
              {payError && <div className="error-note" role="alert">{payError}</div>}
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setPayFee(null)}>Cancel</button>
                <button className="btn btn-primary" disabled={busy}><Wallet size={17} />{busy ? 'Connecting…' : `Continue to Korapay · ${money(amount || 0)}`}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
