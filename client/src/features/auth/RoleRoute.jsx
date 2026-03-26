import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function RoleRoute({ allowedRoles, children }) {
  const { loading, role } = useAuth();

  if (loading) {
    return <div className="screen-center">Loading permissions...</div>;
  }

  if (!role || !allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
