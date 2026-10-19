import { useEffect, useState, useRef } from 'react';
import { Download, Wallet, Baby, UploadCloud, Eye, FileText, CheckCircle2, Clock, AlertTriangle, X, Copy, Check } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { Loading, ErrorNote, EmptyState } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { money, formatDate } from '../../utils/format.js';

const TONE = { Paid: 'ok', 'Part paid': 'warn', Unpaid: 'danger' };

export default function ParentFees() {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch('/payments/children');
  const [params, setParams] = useSearchParams();
  const [payFee, setPayFee] = useState(null); // { child, fee }
  const [method, setMethod] = useState('Bank transfer');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState('');

  // Bank transfer receipt upload state
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [caption, setCaption] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [copiedBank, setCopiedBank] = useState(false);
  const fileInputRef = useRef(null);

  // Receipt inspection modal for history
  const [inspectReceipt, setInspectReceipt] = useState(null);
  const [inspectUrl, setInspectUrl] = useState(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  const paystackReference = params.get('reference') || params.get('trxref');

  useEffect(() => {
    if (!paystackReference) return;
    let cancelled = false;
    api.get(`/payments/paystack/verify/${encodeURIComponent(paystackReference)}`)
      .then(() => {
        if (cancelled) return;
        toast.success('Paystack payment confirmed');
        setParams((next) => { next.delete('reference'); next.delete('trxref'); return next; }, { replace: true });
        reload();
      })
      .catch((err) => !cancelled && toast.error(err.message))
      .finally(() => { cancelled = true; });
    return () => { cancelled = true; };
  }, [paystackReference, reload, setParams, toast]);

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  function openPay(child, fee) {
    setPayFee({ child, fee });
    setAmount(String(fee.balance));
    setMethod('Bank transfer');
    setReceiptFile(null);
    setReceiptPreview(null);
    setCaption('');
    setPayError('');
  }

  function handleFileSelect(file) {
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|gif|pdf)$/i)) {
      setPayError('Please upload an image receipt (JPG, PNG, WEBP) or a PDF document');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setPayError('Receipt file size exceeds 15MB limit');
      return;
    }
    setPayError('');
    setReceiptFile(file);

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setReceiptPreview(e.target.result);
      reader.readAsDataURL(file);
    } else {
      setReceiptPreview(null);
    }
  }

  function copyAccountNumber(num) {
    if (!num) return;
    navigator.clipboard.writeText(num);
    setCopiedBank(true);
    setTimeout(() => setCopiedBank(false), 2000);
    toast.success('Account number copied to clipboard');
  }

  async function submitPayment(e) {
    e.preventDefault();
    setPayError('');
    setBusy(true);

    try {
      if (method === 'Paystack') {
        const result = await api.post('/payments/paystack/initialize', {
          studentId: payFee.child.id,
          feeId: payFee.fee.id,
          amount: Number(amount),
          callbackUrl: `${window.location.origin}/parent/fees`,
        });
        window.location.assign(result.authorizationUrl);
        return;
      }

      if (method === 'Bank transfer') {
        if (!receiptFile) {
          throw new Error('Please select and upload your bank transfer receipt');
        }

        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = (error) => reject(error);
          reader.readAsDataURL(receiptFile);
        });

        await api.post('/payments/bank-transfer', {
          studentId: payFee.child.id,
          feeId: payFee.fee.id,
          amount: Number(amount),
          receiptData: base64Data,
          receiptName: receiptFile.name,
          receiptType: receiptFile.type,
          caption: caption.trim(),
        });

        toast.success('Transfer receipt submitted! It will show as Paid once the admin accepts and confirms it.');
        setPayFee(null);
        reload();
      }
    } catch (err) {
      setPayError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadReceipt(payment) {
    try {
      await api.download(`/payments/${payment.id}/receipt`, `${payment.receiptNo || 'receipt'}.pdf`);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function openUploadedReceipt(payment) {
    setInspectReceipt(payment);
    setInspectLoading(true);
    try {
      const url = await api.getBlobUrl(`/payments/${payment.id}/uploaded-receipt`);
      setInspectUrl(url);
    } catch (err) {
      toast.error('Could not load uploaded receipt: ' + err.message);
      setInspectReceipt(null);
    } finally {
      setInspectLoading(false);
    }
  }

  function closeInspectModal() {
    if (inspectUrl) {
      URL.revokeObjectURL(inspectUrl);
    }
    setInspectReceipt(null);
    setInspectUrl(null);
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
              <div>
                <h3>{child.name}</h3>
                <span className="muted small">{child.className} · ID: {child.schoolId}</span>
              </div>
            </div>
            <div className="summary-strip">
              <div className="summary-box"><div className="v">{money(child.totals.expected)}</div><div className="l">Expected this term</div></div>
              <div className="summary-box"><div className="v">{money(child.totals.paid)}</div><div className="l">Confirmed paid</div></div>
              <div className="summary-box"><div className="v">{money(child.totals.balance)}</div><div className="l">Outstanding balance</div></div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Fee item</th><th className="num">Amount</th><th className="num">Remaining balance</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {child.fees.map((fee) => (
                    <tr key={fee.id}>
                      <td>
                        <div className="strong">{fee.title}</div>
                        {fee.hasPending && (
                          <div style={{ marginTop: 4 }}>
                            <Badge tone="warn">
                              <Clock size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                              {money(fee.pendingAmount)} awaiting admin confirmation
                            </Badge>
                          </div>
                        )}
                      </td>
                      <td className="num">{money(fee.amount)}</td>
                      <td className="num">{money(fee.balance)}</td>
                      <td>
                        <Badge tone={TONE[fee.status]}>{fee.status}</Badge>
                        {fee.hasPending && fee.balance > 0 && (
                          <div className="sub small muted" style={{ marginTop: 2 }}>Receipt under review</div>
                        )}
                      </td>
                      <td className="right">
                        {fee.balance > 0 && (
                          <button className="btn btn-primary btn-sm" onClick={() => openPay(child, fee)}>
                            <Wallet size={14} />Pay fee
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
        <div className="card-head">
          <h3>Payment history & receipts</h3>
        </div>
        {data.payments.length === 0 ? (
          <EmptyState title="No payments yet" text="Payments you make for your children will appear here." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Child</th><th>Paid for</th><th className="num">Amount</th><th>Method</th><th>Status</th><th>Receipt & Note</th><th>Date</th><th /></tr></thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="strong">{p.studentName}</td>
                    <td>{p.feeTitle}</td>
                    <td className="num">{money(p.amount)}</td>
                    <td>{p.method}</td>
                    <td>
                      {p.status === 'success' && <Badge tone="ok">Confirmed (Paid)</Badge>}
                      {p.status === 'pending' && (
                        <div>
                          <Badge tone="warn">Pending Approval</Badge>
                          <div className="sub small muted" style={{ fontSize: 11, marginTop: 2 }}>Awaiting admin review</div>
                        </div>
                      )}
                      {p.status === 'rejected' && (
                        <div>
                          <Badge tone="danger">Declined</Badge>
                          {p.rejectionReason && <div className="sub small" style={{ color: 'var(--danger)', fontSize: 11 }}>{p.rejectionReason}</div>}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="stack" style={{ gap: 4 }}>
                        {p.caption && (
                          <div className="caption-bubble" title={p.caption}>
                            <span>💬 "{p.caption}"</span>
                          </div>
                        )}
                        {p.receiptFile && (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{ padding: '3px 8px', fontSize: 12, width: 'fit-content' }}
                            onClick={() => openUploadedReceipt(p)}
                          >
                            <Eye size={12} /> View uploaded receipt
                          </button>
                        )}
                      </div>
                    </td>
                    <td>{formatDate(p.date)}</td>
                    <td className="right">
                      {p.status === 'success' ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => downloadReceipt(p)} title="Download official school receipt">
                          <Download size={14} /> Official receipt
                        </button>
                      ) : p.status === 'pending' ? (
                        <span className="small muted">Under Review</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pay Fee Modal */}
      {payFee && (
        <Modal title={`Pay ${payFee.fee.title}`} onClose={() => setPayFee(null)} wide={true}>
          <form onSubmit={submitPayment} className="stack" style={{ gap: 16 }}>
            <div style={{ background: 'var(--paper)', padding: 12, borderRadius: 10, border: '1px solid var(--line)' }}>
              <div className="strong" style={{ color: 'var(--ink)' }}>{payFee.child.name} · {payFee.child.className}</div>
              <div className="small muted">Fee balance remaining: <strong>{money(payFee.fee.balance)}</strong></div>
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="amt">Amount to pay (NGN)</label>
                <input
                  id="amt"
                  type="number"
                  min="1"
                  max={payFee.fee.balance}
                  className="input"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="method">Payment method</label>
                <select id="method" className="select" value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="Bank transfer">Bank transfer (Upload receipt)</option>
                  {data.paymentOptions.paystackConfigured && <option value="Paystack">Paystack (Card / USSD / Online)</option>}
                </select>
              </div>
            </div>

            {method === 'Paystack' && (
              <p className="hint">You will be redirected to Paystack to pay securely with your preferred card or online channel.</p>
            )}

            {method === 'Bank transfer' && (
              <>
                <div className="success-panel" style={{ background: '#fef3f7', border: '1px solid #f6c5db', borderRadius: 10, padding: 14 }}>
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div className="strong" style={{ color: 'var(--board)' }}>School Official Bank Account</div>
                    {data.paymentOptions.bank.accountNumber && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '2px 8px', fontSize: 12 }}
                        onClick={() => copyAccountNumber(data.paymentOptions.bank.accountNumber)}
                      >
                        {copiedBank ? <Check size={13} color="var(--ok)" /> : <Copy size={13} />}
                        {copiedBank ? 'Copied' : 'Copy account no.'}
                      </button>
                    )}
                  </div>
                  <div className="small" style={{ color: 'var(--ink)' }}>
                    <div><strong>Bank:</strong> {data.paymentOptions.bank.name || 'Broad Mind College Bank'}</div>
                    <div><strong>Account Name:</strong> {data.paymentOptions.bank.accountName || 'Broad Mind Private School'}</div>
                    <div><strong>Account Number:</strong> <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15 }}>{data.paymentOptions.bank.accountNumber || 'Contact school office'}</span></div>
                    {data.paymentOptions.bank.code && <div><strong>Bank Code:</strong> {data.paymentOptions.bank.code}</div>}
                  </div>
                </div>

                {/* Upload Receipt Section */}
                <div className="field">
                  <label>Upload Payment Receipt (Screenshot, Photo or PDF) <span style={{ color: 'var(--danger)' }}>*</span></label>
                  {!receiptFile ? (
                    <div
                      className={`receipt-dropzone ${dragOver ? 'dragover' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                        onChange={(e) => handleFileSelect(e.target.files?.[0])}
                      />
                      <div className="receipt-dropzone-icon">
                        <UploadCloud size={24} />
                      </div>
                      <div className="strong" style={{ fontSize: 14 }}>Click or drag & drop your receipt here</div>
                      <div className="small muted">JPG, PNG, WEBP or PDF receipt up to 15MB</div>
                    </div>
                  ) : (
                    <div className="receipt-preview-card">
                      {receiptPreview ? (
                        <img src={receiptPreview} alt="Receipt preview" className="receipt-preview-thumb" />
                      ) : (
                        <div className="receipt-pdf-icon">
                          <FileText size={20} />
                          <span>PDF</span>
                        </div>
                      )}
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="strong" style={{ fontSize: 13, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {receiptFile.name}
                        </div>
                        <div className="small muted">{(receiptFile.size / 1024).toFixed(1)} KB · Ready to submit</div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => { setReceiptFile(null); setReceiptPreview(null); }}
                      >
                        <X size={15} /> Remove
                      </button>
                    </div>
                  )}
                </div>

                {/* Caption / Note Under Upload */}
                <div className="field">
                  <label htmlFor="caption">Caption / Depositor Note (Optional)</label>
                  <textarea
                    id="caption"
                    className="textarea"
                    rows={2}
                    placeholder="e.g. Paid by Adeyemi John from GTBank mobile app - First Term fees"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                  />
                  <div className="hint">Include depositor name or notes to help school administration confirm your payment faster.</div>
                </div>

                {/* Status Notice */}
                <div style={{ display: 'flex', gap: 10, background: 'var(--warn-tint)', padding: 12, borderRadius: 8, border: '1px solid #f2db9b' }}>
                  <AlertTriangle size={18} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 2 }} />
                  <div className="small" style={{ color: 'var(--ink)' }}>
                    <strong>Confirmation Notice:</strong> Your payment will be submitted as <em>Pending Confirmation</em>. The school admin must accept and confirm the receipt before your balance shows as <strong>Paid</strong>.
                  </div>
                </div>
              </>
            )}

            {payError && <div className="error-note" role="alert">{payError}</div>}

            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPayFee(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy}>
                <Wallet size={17} />
                {busy ? 'Submitting…' : method === 'Paystack' ? 'Continue to Paystack' : 'Submit receipt'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Inspect Uploaded Receipt Modal */}
      {inspectReceipt && (
        <Modal title={`Uploaded Receipt · ${inspectReceipt.studentName}`} onClose={closeInspectModal} wide={true}>
          <div className="stack" style={{ gap: 16 }}>
            <div style={{ background: 'var(--paper)', padding: 12, borderRadius: 8, border: '1px solid var(--line)' }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div className="strong">{inspectReceipt.feeTitle} · {money(inspectReceipt.amount)}</div>
                  <div className="small muted">Submitted on {formatDate(inspectReceipt.date)}</div>
                </div>
                <Badge tone={inspectReceipt.status === 'success' ? 'ok' : inspectReceipt.status === 'pending' ? 'warn' : 'danger'}>
                  {inspectReceipt.status === 'success' ? 'Confirmed (Paid)' : inspectReceipt.status === 'pending' ? 'Pending Approval' : 'Declined'}
                </Badge>
              </div>
              {inspectReceipt.caption && (
                <div style={{ marginTop: 8, padding: 8, background: '#fff', borderRadius: 6, border: '1px solid var(--line)', fontSize: 13 }}>
                  <strong>Parent caption:</strong> "{inspectReceipt.caption}"
                </div>
              )}
              {inspectReceipt.rejectionReason && (
                <div style={{ marginTop: 8, padding: 8, background: 'var(--danger-tint)', borderRadius: 6, color: 'var(--danger)', fontSize: 13 }}>
                  <strong>Decline reason:</strong> {inspectReceipt.rejectionReason}
                </div>
              )}
            </div>

            {inspectLoading ? (
              <Loading />
            ) : inspectUrl ? (
              <div style={{ textAlign: 'center', background: '#fafafa', padding: 16, borderRadius: 10, border: '1px solid var(--line)' }}>
                {inspectReceipt.receiptMime === 'application/pdf' || inspectReceipt.receiptOriginalName?.endsWith('.pdf') ? (
                  <div className="stack" style={{ alignItems: 'center', padding: 24, gap: 12 }}>
                    <FileText size={48} color="var(--danger)" />
                    <div className="strong">{inspectReceipt.receiptOriginalName || 'Bank Transfer Receipt PDF'}</div>
                    <a href={inspectUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
                      <Download size={14} /> Open or Download PDF
                    </a>
                  </div>
                ) : (
                  <div>
                    <img src={inspectUrl} alt="Uploaded payment receipt" className="receipt-viewer-img" />
                    <div style={{ marginTop: 10 }}>
                      <a href={inspectUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                        Open Full Size in New Tab
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={closeInspectModal}>Close</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
