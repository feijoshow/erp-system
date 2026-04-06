import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import RouteSkeleton from './components/ui/RouteSkeleton';
import ProtectedRoute from './features/auth/ProtectedRoute';
import RoleRoute from './features/auth/RoleRoute';
import { loadRoute } from './lib/routePrefetch';

const Customers = lazy(() => loadRoute('/customers'));
const CustomerProfile = lazy(() => loadRoute('/customers/profile'));
const Dashboard = lazy(() => loadRoute('/dashboard'));
const Analytics = lazy(() => loadRoute('/analytics'));
const Invoices = lazy(() => loadRoute('/invoices'));
const Login = lazy(() => loadRoute('/login'));
const Approvals = lazy(() => loadRoute('/approvals'));
const Procurement = lazy(() => loadRoute('/procurement'));
const OperationsCenter = lazy(() => loadRoute('/operations'));
const Orders = lazy(() => loadRoute('/orders'));
const PendingRefunds = lazy(() => loadRoute('/admin/pending-refunds'));
const Products = lazy(() => loadRoute('/products'));

function withRouteSuspense(element) {
  return <Suspense fallback={<RouteSkeleton />}>{element}</Suspense>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={withRouteSuspense(<Login />)} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Navigate to="/dashboard" replace />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppLayout>
              {withRouteSuspense(<Dashboard />)}
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/products"
        element={
          <ProtectedRoute>
            <AppLayout>
              {withRouteSuspense(<Products />)}
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/procurement"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['inventory', 'admin']}>
              <AppLayout>
                {withRouteSuspense(<Procurement />)}
              </AppLayout>
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/customers"
        element={
          <ProtectedRoute>
            <AppLayout>
              {withRouteSuspense(<Customers />)}
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/operations"
        element={
          <ProtectedRoute>
            <AppLayout>
              {withRouteSuspense(<OperationsCenter />)}
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/analytics"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['sales', 'admin']}>
              <AppLayout>
                {withRouteSuspense(<Analytics />)}
              </AppLayout>
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/approvals"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['admin']}>
              <AppLayout>
                {withRouteSuspense(<Approvals />)}
              </AppLayout>
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/customers/:customerId"
        element={
          <ProtectedRoute>
            <AppLayout>
              {withRouteSuspense(<CustomerProfile />)}
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/orders"
        element={
          <ProtectedRoute>
            <AppLayout>
              {withRouteSuspense(<Orders />)}
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/invoices"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['sales', 'admin']}>
              <AppLayout>
                {withRouteSuspense(<Invoices />)}
              </AppLayout>
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/pending-refunds"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['admin']}>
              <AppLayout>
                {withRouteSuspense(<PendingRefunds />)}
              </AppLayout>
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
