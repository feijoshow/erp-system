import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext';

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/products', label: 'Products' },
  { to: '/customers', label: 'Customers' },
  { to: '/orders', label: 'Orders' },
  { to: '/invoices', label: 'Invoices', roles: ['sales', 'admin'] },
  { to: '/admin/pending-refunds', label: 'Pending Refunds', roles: ['admin'] },
];

export default function AppLayout({ children }) {
  const { signOut, user, role } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/dashboard" className="brand">
          Mini ERP
        </Link>
        <nav>
          {navItems
            .filter((item) => !item.roles || item.roles.includes(role))
            .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'nav-link nav-link-active' : 'nav-link')}
            >
              {item.label}
            </NavLink>
            ))}
        </nav>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="muted">Signed in as</p>
            <strong>{user?.email}</strong>
            <p className="muted role-chip">Role: {role || 'unknown'}</p>
          </div>
          <button type="button" onClick={handleSignOut} className="btn btn-outline">
            Sign out
          </button>
        </header>
        <section>{children}</section>
      </main>
    </div>
  );
}
