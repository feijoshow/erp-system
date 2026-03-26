import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../features/auth/AuthContext';

const initialForm = { fullName: '', email: '', phone: '' };

export default function Customers() {
  const { getAccessToken, hasRole } = useAuth();
  const canCreate = hasRole('sales', 'admin');
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(initialForm);

  async function loadCustomers() {
    const token = await getAccessToken();
    const payload = await api.getCustomers(token);
    setCustomers(payload.data);
  }

  useEffect(() => {
    loadCustomers().catch(console.error);
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    const token = await getAccessToken();

    await api.createCustomer(token, form);
    setForm(initialForm);
    await loadCustomers();
  }

  return (
    <div className="stack">
      <h1>Customers</h1>

      {canCreate ? (
        <form className="card grid grid-3" onSubmit={handleCreate}>
        <input
          placeholder="Full name"
          value={form.fullName}
          onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
          required
        />
        <input
          placeholder="Email"
          type="email"
          value={form.email}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
        />
        <input
          placeholder="Phone"
          value={form.phone}
          onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
        />
        <button className="btn" type="submit">
          Add customer
        </button>
        </form>
      ) : (
        <p className="muted">Only sales and admin roles can add customers.</p>
      )}

      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id}>
                <td>{customer.full_name}</td>
                <td>{customer.email || '-'}</td>
                <td>{customer.phone || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
