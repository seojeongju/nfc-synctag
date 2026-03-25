
import { Routes, Route, Navigate } from 'react-router-dom';
import UserLanding from './pages/UserLanding';
import AdminDashboard from './pages/AdminDashboard';

// Mock Auth Check
const isAuthenticated = () => {
  // TODO: 실제 인증 로직 (localStorage나 쿠키 확인 등)
  return true; 
};

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" />;
}

function App() {
  return (
    <Routes>
      {/* 사용자용 경로 */}
      <Route path="/" element={<UserLanding />} />
      <Route path="/t/:tagId" element={<UserLanding />} />
      
      {/* 관리자용 경로 (Protected) */}
      <Route 
        path="/admin/*" 
        element={
          <PrivateRoute>
            <AdminDashboard />
          </PrivateRoute>
        } 
      />
      
      {/* 로그인 페이지 (임시) */}
      <Route path="/login" element={
        <div className="min-h-screen flex items-center justify-center bg-bg-soft">
          <div className="bg-white p-10 rounded-4xl shadow-xl w-full max-w-md">
            <h2 className="text-2xl font-bold mb-6 text-center">관리자 로그인</h2>
            <button className="purple-btn w-full" onClick={() => window.location.href='/admin'}>
              데모 계정으로 시작하기
            </button>
          </div>
        </div>
      } />
      
      {/* 404 처리 */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;
