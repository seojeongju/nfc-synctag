import { Routes, Route, Navigate } from 'react-router-dom';
import UserLanding from './pages/UserLanding';
import AdminDashboard from './pages/AdminDashboard';
import ConsumerLogin from './pages/ConsumerLogin';
import AdminLogin from './pages/AdminLogin';

// Auth Check (localStorage 기반)
const isAuthenticated = () => {
  return typeof window !== 'undefined' && !!localStorage.getItem('admin_token');
};

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return isAuthenticated() ? <>{children}</> : <Navigate to="/admin/login" replace />;
}

function App() {
  return (
    <Routes>
      {/* 사용자용 경로 */}
      <Route path="/" element={<UserLanding />} />
      <Route path="/t/:tagId" element={<UserLanding />} />

      {/* 소비자 로그인·회원가입 */}
      <Route path="/login" element={<ConsumerLogin />} />

      {/* 관리자 로그인은 /admin/:tab 보다 먼저 매칭되어야 함 */}
      <Route path="/admin/login" element={<AdminLogin />} />

      {/* 관리자용 경로: 탭을 경로로 두어 모바일 시스템 뒤로가기 = 이전 탭/페이지 */}
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
