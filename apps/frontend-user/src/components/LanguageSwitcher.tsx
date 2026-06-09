import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const currentLang = i18n.language && i18n.language.startsWith('en') ? 'en' : 'ko';

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="inline-flex items-center bg-white/70 backdrop-blur-md p-1 rounded-full border border-slate-200/50 shadow-sm relative select-none">
      {/* 슬라이딩 백그라운드 필(pill) */}
      <div
        className="absolute top-1 bottom-1 rounded-full bg-slate-900 shadow-sm transition-all duration-300 ease-out"
        style={{
          width: 'calc(50% - 4px)',
          left: currentLang === 'ko' ? '4px' : 'calc(50%)'
        }}
      />
      
      {/* 한국어 버튼 */}
      <button
        type="button"
        onClick={() => changeLanguage('ko')}
        className={`relative z-10 w-10 py-1 text-[10px] font-black transition-colors duration-300 rounded-full ${
          currentLang === 'ko' ? 'text-white' : 'text-slate-400 hover:text-slate-600'
        }`}
        aria-label="Switch to Korean"
      >
        KO
      </button>

      {/* 영어 버튼 */}
      <button
        type="button"
        onClick={() => changeLanguage('en')}
        className={`relative z-10 w-10 py-1 text-[10px] font-black transition-colors duration-300 rounded-full ${
          currentLang === 'en' ? 'text-white' : 'text-slate-400 hover:text-slate-600'
        }`}
        aria-label="Switch to English"
      >
        EN
      </button>
    </div>
  );
}
