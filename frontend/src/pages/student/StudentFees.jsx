import { Download, Info } from 'lucide-react';
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

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

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

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 18px',
          background: 'var(--panel-alt, #fdf2f7)',
          border: '1px solid var(--line, #f7cadf)',
          borderRadius: 12,
          marginBottom: 20,
          color: 'var(--ink, #3a1120)',
          fontSize: 14,
        }}
      >
        <Info size={20} style={{ color: 'var(--primary, #7a1440)', flexShrink: 0 }} />
        <div>
          <strong>Note:</strong> Fee payments are made directly by your parent or guardian via the Parent Portal (using Paystack or bank transfer). All payments recorded for you are shown below, and you can download your official receipts anytime.
        </div>
      </div>

      <div className="summary-strip">
        <div className="summary-box"><div className="v">{money(data.totals.expected)}</div><div className="l">Expected this term</div></div>
        <div className="summary-box"><div className="v">{money(data.totals.paid)}</div><div className="l">Paid so far</div></div>
        <div className="summary-box"><div className="v">{money(data.totals.balance)}</div><div className="l">Outstanding balance</div></div>
      </div>

      <div className="card card-flush" style={{ marginBottom: 20 }}>
        <div className="card-head"><h3>Term fee breakdown</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Fee</th>
                <th className="num">Total fee</th>
                <th className="num">Paid</th>
                <th className="num">Remaining balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.fees.map((fee) => (
                <tr key={fee.id}>
                  <td className="strong">{fee.title}</td>
                  <td className="num">{money(fee.amount)}</td>
                  <td className="num">{money(fee.paid || 0)}</td>
                  <td className="num strong">{money(fee.balance)}</td>
                  <td><Badge tone={TONE[fee.status]}>{fee.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card card-flush">
        <div className="card-head"><h3>Payment history & receipts</h3></div>
        {data.payments.length === 0 ? (
          <EmptyState title="No payments recorded yet" text="When your parent makes a fee payment, it will appear here with an official downloadable receipt." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Paid for</th>
                  <th className="num">Amount</th>
                  <th>Payment method</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="strong">{p.feeTitle}</td>
                    <td className="num strong">{money(p.amount)}</td>
                    <td>{p.method}</td>
                    <td>
                      <Badge tone={p.status === 'success' ? 'ok' : p.status === 'declined' ? 'danger' : 'warn'}>
                        {p.status === 'success' ? 'Confirmed' : p.status === 'declined' ? 'Declined' : 'Pending'}
                      </Badge>
                      {p.declineReason && <div className="sub small muted">{p.declineReason}</div>}
                    </td>
                    <td>{formatDate(p.date)}</td>
                    <td className="right">
                      {p.status === 'success' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => downloadReceipt(p)}>
                          <Download size={14} />Receipt
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
