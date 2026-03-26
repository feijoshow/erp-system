import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';

export default function Login() {
  const { user, signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState({ email: '', password: '' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    const fn = mode === 'signin' ? signIn : signUp;
    const { error } = await fn(form.email, form.password);

    if (error) {
      setMessage(error.message);
    } else if (mode === 'signup') {
      setMessage('Account created. Confirm your email if your project requires verification.');
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
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={form.password}
          onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          required
        />

        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Working...' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>

        {message ? <p className="status">{message}</p> : null}

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
