import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

type Tab = 'login' | 'signup';

function GoogleMark() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function KakaoMark() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="#181600" aria-hidden>
      <path d="M12 3C6.48 3 2 6.58 2 11c0 2.98 1.96 5.59 4.89 7.07L6 21l4.33-2.31c.62.08 1.25.13 1.89.13 5.52 0 10-3.58 10-8s-4.48-8-10-8z" />
    </svg>
  );
}

export default function ConsumerLogin() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [providers, setProviders] = useState<{ google: boolean; kakao: boolean }>({
    google: false,
    kakao: false
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/providers');
        if (res.ok && !cancelled) {
          const d = await res.json();
          setProviders({ google: !!d.google, kakao: !!d.kakao });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setError('');
  }, [tab]);

  const persistUser = (user: unknown) => {
    localStorage.setItem('wowtag_current_user', JSON.stringify(user));
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');

    try {
      if (tab === 'login') {
        const res = await fetch('/api/user/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.user) {
          persistUser(data.user);
          navigate('/', { replace: true });
          return;
        }
        setError(typeof data.error === 'string' ? data.error : '로그인에 실패했습니다.');
      } else {
        const res = await fetch('/api/user/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password, name: name.trim() || undefined })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.user) {
          persistUser(data.user);
          navigate('/', { replace: true });
          return;
        }
        setError(typeof data.error === 'string' ? data.error : '회원가입에 실패했습니다.');
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSocial = (kind: 'google' | 'kakao') => {
    const enabled = kind === 'google' ? providers.google : providers.kakao;
    if (!enabled) {
      alert(
        `${kind === 'google' ? 'Google' : 'Kakao'} 로그인은 OAuth 클라이언트 ID를 워커 환경 변수에 설정하면 활성화됩니다.\n\n지금은 이메일 로그인을 이용해 주세요.`
      );
      return;
    }
    alert('OAuth 리다이렉트 연동은 클라이언트 등록 후 콜백 URL과 함께 설정합니다.');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#EEF2F7] p-4 font-sans text-slate-900">
      <div className="w-full max-w-md bg-white rounded-[2rem] shadow-[0_8px_40px_rgba(15,23,42,0.08)] border border-slate-100/90 px-6 py-10 sm:px-10 sm:py-12">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-5">
            <img src="/gold_synctag_logo_v2.png" alt="" className="w-12 h-12 object-contain rounded-xl shadow-sm" />
          </div>
          <h1 className="text-2xl sm:text-[1.65rem] font-black text-slate-900 tracking-tight">간편 로그인</h1>
          <p className="text-sm font-bold text-slate-500 mt-2 leading-relaxed px-1">
            이메일·비밀번호 또는 소셜 계정으로 Gold SyncTag를 시작하세요.
          </p>
        </div>

        <div className="flex rounded-2xl bg-slate-100/90 p-1 gap-1 mb-8">
          <button
            type="button"
            onClick={() => setTab('login')}
            className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${
              tab === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            간편 로그인
          </button>
          <button
            type="button"
            onClick={() => setTab('signup')}
            className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${
              tab === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            회원가입
          </button>
        </div>

        <form onSubmit={handleEmailSubmit} className="space-y-4">
          {tab === 'signup' && (
            <div>
              <label className="sr-only">이름</label>
              <input
                type="text"
                placeholder="이름 (선택)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold placeholder:text-slate-400 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition-all"
              />
            </div>
          )}
          <div>
            <label className="sr-only">이메일</label>
            <input
              required
              type="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold placeholder:text-slate-400 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition-all"
            />
          </div>
          <div>
            <label className="sr-only">비밀번호</label>
            <input
              required
              type="password"
              placeholder={tab === 'signup' ? '비밀번호 (8자 이상)' : '비밀번호'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              minLength={tab === 'signup' ? 8 : undefined}
              className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold placeholder:text-slate-400 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition-all"
            />
          </div>

          {error && (
            <p className="text-xs font-bold text-rose-600 text-center bg-rose-50 border border-rose-100 rounded-xl py-2.5 px-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim() || !password}
            className="w-full h-12 rounded-xl bg-[#1e293b] hover:bg-slate-800 text-white text-sm font-black shadow-lg shadow-slate-900/15 flex items-center justify-center gap-2 transition-all disabled:opacity-45 active:scale-[0.99]"
          >
            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
            {tab === 'login' ? '이메일로 로그인' : '이메일로 회원가입'}
          </button>
        </form>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-4 text-[11px] font-bold text-slate-400">또는 소셜 계정으로 계속하기</span>
          </div>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => handleSocial('google')}
            className="w-full h-12 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-800 flex items-center justify-center gap-3 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
          >
            <GoogleMark />
            Google로 계속하기
          </button>
          <button
            type="button"
            onClick={() => handleSocial('kakao')}
            className="w-full h-12 rounded-xl bg-[#FEE500] text-[#181600] text-sm font-black flex items-center justify-center gap-3 hover:bg-[#fdd835] transition-all shadow-sm border border-[#f0d500]"
          >
            <KakaoMark />
            카카오로 계속하기
          </button>
        </div>

        <p className="text-center text-xs font-bold text-slate-500 mt-8 leading-relaxed">
          처음이신가요? 상단의{' '}
          <button type="button" onClick={() => setTab('signup')} className="text-slate-800 underline underline-offset-2 font-black">
            회원가입
          </button>{' '}
          탭에서 이메일 계정을 만들 수 있어요.
        </p>

        <p className="text-[10px] font-bold text-slate-400 text-center mt-6 leading-relaxed">
          최초 로그인 시 필요한 동의는 계정 상태에 따라 자동 처리됩니다.
        </p>

        <div className="mt-8 pt-6 border-t border-slate-100 text-center space-y-3">
          <Link to="/" className="block text-xs font-black text-slate-500 hover:text-slate-800 transition-colors">
            ← 메인으로 돌아가기
          </Link>
          <Link to="/admin/login" className="block text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors">
            관리자 로그인
          </Link>
        </div>
      </div>
    </div>
  );
}
