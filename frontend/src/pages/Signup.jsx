import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, UserPlus2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { SCHOOL } from '../config/school.js';

// A parent creates their own account here, then registers their children
// and pays fees from the parent portal. No school ID is needed to sign up.
export default function Signup() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={`/${user.role}`} replace />;

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (form.password !== confirm) return setError('Your passwords do not match');
    setBusy(true);
    try {
      await register(form);
      navigate('/parent', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-board" aria-hidden="true">
        <div>
          <div className="crest">{SCHOOL.name[0]}</div>
          <h1>{SCHOOL.name}</h1>
          <div className="motto">{SCHOOL.motto}</div>
        </div>
        <div>
          <p style={{ color: '#f5c8dc', maxWidth: '40ch', fontSize: 16 }}>
            Create a parent account to register your children, keep an eye on their results
            and lessons, and pay school fees online — no more queueing at the school office.
          </p>
        </div>
      </section>

      <section className="login-form-wrap">
        <div className="login-form">
          <h2>Create a parent account</h2>
          <p className="muted" style={{ marginTop: 6 }}>Takes less than a minute. You can register your children right after.</p>

          <form className="stack" onSubmit={handleSubmit} style={{ gap: 16, marginTop: 22 }}>
            <div className="field">
              <label htmlFor="name">Your full name</label>
              <input id="name" className="input" value={form.name} onChange={set('name')} autoComplete="name" required />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" className="input" value={form.email} onChange={set('email')} autoComplete="email" required />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone number</label>
              <input id="phone" type="tel" className="input" value={form.phone} onChange={set('phone')} autoComplete="tel" />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="password-wrap">
                <input
                  id="password" className="input" type={showPassword ? 'text' : 'password'}
                  value={form.password} onChange={set('password')} autoComplete="new-password" minLength={6} required
                />
                <button
                  type="button" className="icon-btn"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <span className="hint">At least 6 characters.</span>
            </div>
            <div className="field">
              <label htmlFor="confirm">Confirm password</label>
              <input id="confirm" type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
            </div>

            {error && <div className="error-note" role="alert">{error}</div>}

            <button className="btn btn-primary btn-block" disabled={busy}>
              <UserPlus2 size={18} />
              {busy ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="muted small" style={{ marginTop: 18, textAlign: 'center' }}>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
