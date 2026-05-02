import { useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Loader2, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import UserLanding from './pages/UserLanding';
import AdminDashboard from './pages/AdminDashboard';

// Auth Check (localStorage 기반)
const isAuthenticated = () => {
  return typeof window !== 'undefined' && !!localStorage.getItem('admin_token');
};

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" />;
}

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('admin_token', data.token);
        navigate('/admin');
      } else {
        const data = await res.json();
        setError(data.error || '로그인에 실패했습니다.');
      }
    } catch (err: any) {
      setError('서버와 통신하는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-4 font-sans leading-relaxed text-slate-900 animate-in fade-in duration-300">
      <div className="bg-white p-8 lg:p-12 rounded-[2.5rem] shadow-xl border border-slate-100/80 w-full max-w-md flex flex-col relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-40 h-40 bg-purple-gradient rounded-full opacity-5 blur-3xl"></div>

        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-purple-gradient flex items-center justify-center shadow-xl shadow-purple-500/20 mb-5 animate-pulse">
            <ShieldCheck className="text-white w-7 h-7" />
          </div>
          <h2 className="text-3xl font-black tracking-tight bg-clip-text text-transparent bg-purple-gradient">WowTag</h2>
          <p className="text-slate-400 text-xs font-bold mt-1 tracking-wider uppercase">관리자 로그인 시스템</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 tracking-widest pl-1 uppercase">이메일 주소</label>
            <div className="relative flex items-center">
              <Mail className="absolute left-4 w-5 h-5 text-slate-300 group-focus-within:text-primary transition-colors" />
              <input 
                required 
                type="email" 
                placeholder="admin@wowtag.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-14 bg-slate-100/50 hover:bg-slate-100 focus:bg-white border border-transparent hover:border-purple-200/50 focus:border-purple-400 rounded-2xl pl-12 pr-4 font-bold outline-none transition-all text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 tracking-widest pl-1 uppercase">비밀번호</label>
            <div className="relative flex items-center">
              <KeyRound className="absolute left-4 w-5 h-5 text-slate-300 group-focus-within:text-primary transition-colors" />
              <input 
                required 
                type="password" 
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-14 bg-slate-100/50 hover:bg-slate-100 focus:bg-white border border-transparent hover:border-purple-200/50 focus:border-purple-400 rounded-2xl pl-12 pr-4 font-bold outline-none transition-all text-sm"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs font-bold text-rose-500 text-center bg-rose-50/60 p-3 rounded-xl border border-rose-100 animate-in fade-in duration-200">{error}</p>
          )}

          <button 
            type="submit" 
            disabled={loading || !email || !password}
            className="w-full h-14 purple-btn text-base font-black shadow-xl shadow-purple-500/25 flex items-center justify-center gap-2 hover:scale-[1.01] transition-all disabled:opacity-50"
          >
            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
            로그인하기
          </button>
        </form>

        <p className="text-[10px] text-slate-400 font-bold text-center mt-8 tracking-wider">
          제이에로스 관리자 전용 로그인 페이지입니다.
        </p>
      </div>
    </div>
  );
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
      
      {/* 로그인 페이지 */}
      <Route path="/login" element={<LoginPage />} />
      
      {/* 404 처리 */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;
