import { Routes, Route, Navigate } from 'react-router-dom';
import UserLanding from './pages/UserLanding';
import AdminDashboard from './pages/AdminDashboard';
import ConsumerLogin from './pages/ConsumerLogin';

// Auth Check (localStorage 기반)
const isAuthenticated = () => {
  return typeof window !== 'undefined' && !!localStorage.getItem('admin_token');
};

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" replace />;
}

function App() {
  return (
    <Routes>
      {/* 사용자용 경로 */}
      <Route path="/" element={<UserLanding />} />
      <Route path="/t/:tagId" element={<UserLanding />} />

      {/* 통합 로그인 (일반·관리자) */}
      <Route path="/login" element={<ConsumerLogin />} />
      <Route path="/admin/login" element={<Navigate to="/login" replace />} />

      {/* 관리자 콘솔 */}
      <Route
        path="/admin"
        element={
          <PrivateRoute>
            <Navigate to="/admin/dashboard" replace />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/:tab"
        element={
          <PrivateRoute>
            <AdminDashboard />
          </PrivateRoute>
        }
      />

      {/* 404 처리 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
