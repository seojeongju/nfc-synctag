import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getKakaoRedirectUri, parseKakaoOAuthState } from '../lib/kakaoAuth';

export default function KakaoLoginCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const oauthError = searchParams.get('error');
    if (oauthError) {
      setError(t('login.kakao_login_failed'));
      return;
    }

    const code = searchParams.get('code');
    if (!code) {
      navigate('/login', { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/user/auth/kakao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            redirect_uri: getKakaoRedirectUri()
          })
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (res.ok && data.user) {
          localStorage.setItem('wowtag_current_user', JSON.stringify(data.user));
          const { next } = parseKakaoOAuthState(searchParams.get('state'));
          if (next === 'wallet') {
            navigate('/#myWallet', { replace: true });
            return;
          }
          navigate('/', { replace: true });
          return;
        }

        setError(typeof data.error === 'string' ? data.error : t('login.kakao_login_failed'));
      } catch {
        if (!cancelled) {
          setError(t('common.network_error'));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams, t]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#EEF2F7] p-4 font-sans text-slate-900">
      <div className="w-full max-w-md bg-white rounded-[2rem] shadow-[0_8px_40px_rgba(15,23,42,0.08)] border border-slate-100/90 px-6 py-10 text-center">
        {!error ? (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-slate-700 mx-auto mb-4" />
            <p className="text-sm font-bold text-slate-600">{t('login.kakao_callback_processing')}</p>
          </>
        ) : (
          <>
            <p className="text-sm font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl py-3 px-4 mb-6">
              {error}
            </p>
            <Link to="/login" className="text-sm font-black text-slate-700 underline underline-offset-2">
              {t('login.title')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
