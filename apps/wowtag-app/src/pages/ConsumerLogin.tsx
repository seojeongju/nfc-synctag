import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { setAdminSession } from '../lib/adminSession';
import { requestGoogleAccessToken, waitForGoogleScript } from '../lib/googleAuth';
import { startKakaoLogin } from '../lib/kakaoAuth';
import { useToast } from '../components/ToastProvider';
import LanguageSwitcher from '../components/LanguageSwitcher';

const ADMIN_EMAIL = 'admin@wowtag.com';

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

/** 소비자·관리자 공통 로그인 (/login) — 관리자는 admin@wowtag.com + 관리자 비밀번호 */
export default function ConsumerLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [providers, setProviders] = useState<{ google: string | null; kakao: string | null }>({
    google: null,
    kakao: null
  });

  useEffect(() => {
    const pre = searchParams.get('email');
    if (pre && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pre)) {
      setEmail(pre);
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/providers');
        if (res.ok && !cancelled) {
          const d = await res.json();
          setProviders({ google: d.google || null, kakao: d.kakao || null });
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

  const afterConsumerAuth = () => {
    const next = searchParams.get('next');
    if (next === 'wallet') {
      navigate('/#myWallet', { replace: true });
      return;
    }
    navigate('/', { replace: true });
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    const em = email.trim().toLowerCase();

    if (tab === 'signup') {
      if (em === ADMIN_EMAIL) {
        setError(t('login.admin_email_signup_error'));
        return;
      }
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/user/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: em, password, name: name.trim() || undefined })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.user) {
          persistUser(data.user);
          afterConsumerAuth();
          return;
        }
        setError(typeof data.error === 'string' ? data.error : t('login.signup_failed'));
      } catch {
        setError(t('common.network_error'));
      } finally {
        setLoading(false);
      }
      return;
    }

    // 로그인 탭
    setLoading(true);
    setError('');

    try {
      if (em === ADMIN_EMAIL) {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: em, password })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.token) {
          setAdminSession(data.token);
          navigate('/admin/dashboard', { replace: true });
          return;
        }
        setError(typeof data.error === 'string' ? data.error : t('login.admin_login_failed'));
        return;
      }

      const res = await fetch('/api/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em, password })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.user) {
        persistUser(data.user);
        afterConsumerAuth();
        return;
      }
      setError(typeof data.error === 'string' ? data.error : t('login.login_failed'));
    } catch {
      setError(t('common.network_error'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!providers.google) return;

    const ready = await waitForGoogleScript();
    if (!ready) {
      showToast('error', t('login.google_lib_loading'));
      return;
    }

    try {
      requestGoogleAccessToken(
        providers.google,
        async (accessToken) => {
          setLoading(true);
          setError('');
          try {
            const res = await fetch('/api/user/auth/google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ access_token: accessToken })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.user) {
              persistUser(data.user);
              afterConsumerAuth();
              showToast('success', t('login.google_login_success'));
              return;
            }
            setError(typeof data.error === 'string' ? data.error : t('login.google_login_failed'));
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : t('common.error_occurred');
            setError(message);
          } finally {
            setLoading(false);
          }
        }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('common.error_occurred');
      showToast('error', t('login.google_init_failed', { message }));
    }
  };

  const handleKakaoLogin = () => {
    if (!providers.kakao) return;

    try {
      const next = searchParams.get('next') || undefined;
      startKakaoLogin(providers.kakao, { next });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('common.error_occurred');
      showToast('error', t('login.kakao_init_failed', { message }));
    }
  };

  const handleSocial = (kind: 'google' | 'kakao') => {
    const enabled = kind === 'google' ? !!providers.google : !!providers.kakao;
    if (!enabled) {
      showToast(
        'info',
        kind === 'kakao' ? t('login.kakao_env_error') : t('login.oauth_env_error', { kind: 'Google' }),
        7000
      );
      return;
    }

    if (kind === 'google') {
      void handleGoogleLogin();
      return;
    }

    if (kind === 'kakao') {
      void handleKakaoLogin();
      return;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#EEF2F7] p-4 font-sans text-slate-900">
      <div className="w-full max-w-md bg-white rounded-[2rem] shadow-[0_8px_40px_rgba(15,23,42,0.08)] border border-slate-100/90 px-6 py-10 sm:px-10 sm:py-12 relative">
        <div className="absolute top-6 right-6 sm:top-8 sm:right-8">
          <LanguageSwitcher />
        </div>
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-5">
            <img src="/gold_synctag_logo_v2.png" alt="" className="w-12 h-12 object-contain rounded-xl shadow-sm" />
          </div>
          <h1 className="text-2xl sm:text-[1.65rem] font-black text-slate-900 tracking-tight">{t('login.title')}</h1>
          <p className="text-sm font-bold text-slate-500 mt-2 leading-relaxed px-1">
            {t('login.login_info', { adminEmail: ADMIN_EMAIL })}
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
            {t('login.title')}
          </button>
          <button
            type="button"
            onClick={() => setTab('signup')}
            className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${
              tab === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t('login.signup')}
          </button>
        </div>

        <form onSubmit={handleEmailSubmit} className="space-y-4">
          {tab === 'signup' && (
            <div>
              <label className="sr-only">{t('login.name')}</label>
              <input
                type="text"
                placeholder={t('login.name')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold placeholder:text-slate-400 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition-all"
              />
            </div>
          )}
          <div>
            <label className="sr-only">{t('login.email')}</label>
            <input
              required
              type="email"
              placeholder={t('login.email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold placeholder:text-slate-400 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition-all"
            />
          </div>
          <div>
            <label className="sr-only">{t('login.password')}</label>
            <input
              required
              type="password"
              placeholder={tab === 'signup' ? t('login.password_placeholder_signup') : t('login.password')}
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
            {tab === 'login' ? t('login.login_email_btn') : t('login.signup_email_btn')}
          </button>
        </form>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-4 text-[11px] font-bold text-slate-400">{t('login.social_continue')}</span>
          </div>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => handleSocial('google')}
            className="w-full h-12 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-800 flex items-center justify-center gap-3 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
          >
            <GoogleMark />
            {t('login.google_continue')}
          </button>
          <button
            type="button"
            onClick={() => handleSocial('kakao')}
            className="w-full h-12 rounded-xl bg-[#FEE500] text-[#181600] text-sm font-black flex items-center justify-center gap-3 hover:bg-[#fdd835] transition-all shadow-sm border border-[#f0d500]"
          >
            <KakaoMark />
            {t('login.kakao_continue')}
          </button>
        </div>

        <p className="text-center text-xs font-bold text-slate-500 mt-8 leading-relaxed">
          {t('login.signup_prompt')}
          <button type="button" onClick={() => setTab('signup')} className="text-slate-800 underline underline-offset-2 font-black">
            {t('login.signup')}
          </button>{' '}
          {t('login.signup_prompt_end')}
        </p>

        <p className="text-[10px] font-bold text-slate-400 text-center mt-6 leading-relaxed">
          {t('login.consent_info')}
        </p>

        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <Link to="/" className="text-xs font-black text-slate-500 hover:text-slate-800 transition-colors">
            {t('common.back_to_main')}
          </Link>
        </div>
      </div>
    </div>
  );
}
