import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useToast } from '../components/ui/ToastProvider';
import { toFriendlyAuthMessage } from '../features/auth/authErrorMessages';
import { useAuth } from '../features/auth/AuthContext';

function validateAuthForm(form) {
  const errors = {};

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (!form.password || form.password.length < 6) {
    errors.password = 'Password must be at least 6 characters.';
  }

  return errors;
}

export default function Login() {
  const { user, signIn, signUp } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState({ email: '', password: '' });
  const [formErrors, setFormErrors] = useState({});
  const [message, setMessage] = useState('');
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const errors = validateAuthForm(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setBusy(true);
    setMessage('');
    setHint('');

    const fn = mode === 'signin' ? signIn : signUp;
    const { error } = await fn(form.email, form.password);

    if (error) {
      const friendlyAuth = toFriendlyAuthMessage(error, mode);
      setMessage(friendlyAuth.message);
      setHint(friendlyAuth.hint || '');
      toast.error(friendlyAuth.message);
    } else if (mode === 'signup') {
      setMessage('Account created. Confirm your email if your project requires verification.');
      setHint('After confirming email, return to Sign in and continue.');
      toast.success('Account created successfully.');
    } else {
      toast.success('Signed in successfully.');
    }

    setBusy(false);
  }

  return (
    <div className="screen-center">
      <form onSubmit={handleSubmit} className="card auth-card">
        <h1>Mini ERP</h1>
        <p className="muted">Sign in to manage products, customers, orders, and invoices.</p>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={form.email}
          onChange={(event) => {
            setForm((current) => ({ ...current, email: event.target.value }));
            setFormErrors((current) => ({ ...current, email: '' }));
          }}
          required
        />
        {formErrors.email ? <p className="status">{formErrors.email}</p> : null}

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={form.password}
          onChange={(event) => {
            setForm((current) => ({ ...current, password: event.target.value }));
            setFormErrors((current) => ({ ...current, password: '' }));
          }}
          required
        />
        {formErrors.password ? <p className="status">{formErrors.password}</p> : null}

        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Working...' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>

        {message ? <p className="status">{message}</p> : null}
        {hint ? <p className="muted">{hint}</p> : null}

        <button
          type="button"
          className="text-button"
          onClick={() => setMode((current) => (current === 'signin' ? 'signup' : 'signin'))}
        >
          {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
