import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, GraduationCap, Presentation, ShieldCheck, Users, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { SCHOOL } from '../config/school.js';

// One tab per portal. "demo" fills in the sample accounts from the backend seed data.
const PORTALS = [
  { key: 'student', label: 'Student', icon: GraduationCap, idLabel: 'School ID', placeholder: 'CVC/26/001', demo: ['CVC/26/001', 'student123'] },
  { key: 'parent', label: 'Parent', icon: Users, idLabel: 'Email', placeholder: 'you@example.com', demo: ['parent@crestview.edu', 'parent123'] },
  { key: 'teacher', label: 'Teacher', icon: Presentation, idLabel: 'School email', placeholder: 'you@crestview.edu', demo: ['tunde@crestview.edu', 'teacher123'] },
  { key: 'admin', label: 'Principal', icon: ShieldCheck, idLabel: 'School email', placeholder: 'principal@crestview.edu', demo: ['principal@crestview.edu', 'admin123'] },
];

// Decorative chalk timetable on the left side
const CHALK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const CHALK_SUBJECTS = ['Maths', 'English', 'Science', 'Civics', 'ICT', 'Social'];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('student');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Already logged in? Go straight to your portal.
  if (user) return <Navigate to={`/${user.role}`} replace />;

  const portal = PORTALS.find((p) => p.key === role);

  function pickRole(key) {
    setRole(key);
    setError('');
    setIdentifier('');
    setPassword('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const loggedIn = await login(identifier, password, role);
      navigate(`/${loggedIn.role}`, { replace: true });
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

        <div className="chalk-table">
          <div className="chalk-row chalk-head">
            <div />
            {CHALK_DAYS.map((d) => <div key={d}>{d}</div>)}
          </div>
          {[0, 1, 2, 3].map((row) => (
            <div className="chalk-row" key={row}>
              <div>{row + 1}</div>
              {CHALK_DAYS.map((d, col) => (
                <div key={d}>{CHALK_SUBJECTS[(row + col * 2) % CHALK_SUBJECTS.length]}</div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="login-form-wrap">
        <div className="login-form">
          <h2>Sign in to your portal</h2>
          <p className="muted" style={{ marginTop: 6 }}>Choose who you are, then enter your details.</p>

          <div className="role-tabs" role="tablist" aria-label="Portal type">
            {PORTALS.map((p) => (
              <button
                key={p.key}
                type="button"
                role="tab"
                aria-selected={role === p.key}
                className={`role-tab ${role === p.key ? 'active' : ''}`}
                onClick={() => pickRole(p.key)}
              >
                <p.icon size={17} />
                {p.label}
              </button>
            ))}
          </div>

          <form className="stack" onSubmit={handleSubmit} style={{ gap: 16 }}>
            <div className="field">
              <label htmlFor="identifier">{portal.idLabel}</label>
              <input
                id="identifier" className="input" value={identifier} autoComplete="username"
                placeholder={portal.placeholder} onChange={(e) => setIdentifier(e.target.value)} required
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="password-wrap">
                <input
                  id="password" className="input" type={showPassword ? 'text' : 'password'}
                  value={password} autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)} required
                />
                <button
                  type="button" className="icon-btn"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && <div className="error-note" role="alert">{error}</div>}

            <button className="btn btn-primary btn-block" disabled={busy}>
              <LogIn size={18} />
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="demo-box">
            <div className="strong">Trying the demo?</div>
            <p className="muted small" style={{ margin: '4px 0 10px' }}>
              Fill in a sample {portal.label.toLowerCase()} account.
            </p>
            <button
              type="button" className="btn btn-outline btn-sm"
              onClick={() => { setIdentifier(portal.demo[0]); setPassword(portal.demo[1]); }}
            >
              Use sample {portal.label.toLowerCase()} login
            </button>
          </div>

          {role === 'parent' && (
            <p className="muted small" style={{ marginTop: 18, textAlign: 'center' }}>
              New parent? <Link to="/register">Create an account</Link> to register your children and pay fees online.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
