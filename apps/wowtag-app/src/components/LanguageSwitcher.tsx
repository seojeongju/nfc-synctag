import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  // i18n.language가 'ko-KR' 등 포맷일 수 있으므로 앞의 2자만 기준으로 판단하거나 exact 매칭
  const currentLang = i18n.language && i18n.language.startsWith('en') ? 'en' : 'ko';

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="inline-flex items-center bg-slate-100 p-1 rounded-full border border-slate-200 shadow-inner relative select-none">
      {/* 슬라이딩 백그라운드 필(pill) */}
      <div
        className="absolute top-1 bottom-1 rounded-full bg-white shadow-sm transition-all duration-300 ease-out"
        style={{
          width: 'calc(50% - 4px)',
          left: currentLang === 'ko' ? '4px' : 'calc(50%)'
        }}
      />
      
      {/* 한국어 버튼 */}
      <button
        type="button"
        onClick={() => changeLanguage('ko')}
        className={`relative z-10 w-12 py-1 text-xs font-black transition-colors duration-300 rounded-full ${
          currentLang === 'ko' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'
        }`}
        aria-label="Switch to Korean"
      >
        KO
      </button>

      {/* 영어 버튼 */}
      <button
        type="button"
        onClick={() => changeLanguage('en')}
        className={`relative z-10 w-12 py-1 text-xs font-black transition-colors duration-300 rounded-full ${
          currentLang === 'en' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'
        }`}
        aria-label="Switch to English"
      >
        EN
      </button>
    </div>
  );
}
