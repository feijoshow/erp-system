import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext';
import { prefetchRoute } from '../../lib/routePrefetch';
import { useToast } from '../ui/ToastProvider';

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/analytics', label: 'Analytics', roles: ['sales', 'admin'] },
  { to: '/operations', label: 'Operations Center' },
  { to: '/approvals', label: 'Approvals', roles: ['admin'] },
  { to: '/procurement', label: 'Procurement', roles: ['inventory', 'admin'] },
  { to: '/products', label: 'Products' },
  { to: '/customers', label: 'Customers' },
  { to: '/orders', label: 'Orders' },
  { to: '/invoices', label: 'Invoices', roles: ['sales', 'admin'] },
  { to: '/admin/pending-refunds', label: 'Pending Refunds', roles: ['admin'] },
];

export default function AppLayout({ children }) {
  const { signOut, user, role } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  const currentItem = navItems.find((item) => location.pathname.startsWith(item.to));

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setNavOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [navOpen]);

  async function handleSignOut() {
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch (_error) {
      toast.error('Unable to sign out right now. Please try again.');
    }
  }

  function handleCloseNav() {
    setNavOpen(false);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${navOpen ? 'sidebar-open' : ''}`}>
        <Link to="/dashboard" className="brand">
          Medium ERP
        </Link>
        <nav>
          {navItems
            .filter((item) => !item.roles || item.roles.includes(role))
            .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={handleCloseNav}
              onMouseEnter={() => prefetchRoute(item.to)}
              onFocus={() => prefetchRoute(item.to)}
              className={({ isActive }) => (isActive ? 'nav-link nav-link-active' : 'nav-link')}
            >
              {item.label}
            </NavLink>
            ))}
        </nav>
      </aside>
      <button
        type="button"
        className={`sidebar-backdrop ${navOpen ? 'sidebar-backdrop-open' : ''}`}
        onClick={handleCloseNav}
        aria-label="Close navigation"
      />

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-title-wrap">
            <button
              type="button"
              className="btn btn-outline nav-toggle"
              onClick={() => setNavOpen((current) => !current)}
            >
              {navOpen ? 'Close menu' : 'Menu'}
            </button>
            <div>
              <h1 className="page-title">{currentItem?.label || 'Workspace'}</h1>
              <p className="muted">{new Date().toLocaleDateString()}</p>
            </div>
          </div>
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
