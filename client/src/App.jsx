import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './features/auth/ProtectedRoute';
import RoleRoute from './features/auth/RoleRoute';
import Customers from './pages/Customers';
import Dashboard from './pages/Dashboard';
import Invoices from './pages/Invoices';
import Login from './pages/Login';
import Orders from './pages/Orders';
import PendingRefunds from './pages/PendingRefunds';
import Products from './pages/Products';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

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
              <Dashboard />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/products"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Products />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/customers"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Customers />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/orders"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Orders />
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
                <Invoices />
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
                <PendingRefunds />
              </AppLayout>
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
