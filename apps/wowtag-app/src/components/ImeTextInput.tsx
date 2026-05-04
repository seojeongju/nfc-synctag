import { useEffect, useRef, useState } from 'react';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
  /** 명시할 때만 설정. 미설정 시 시스템/문서 기본(키패드 종류 임의 고정 안 함) */
  lang?: string;
  /** 모바일에서 키보드 올라온 뒤 필드가 가려지지 않도록 스크롤 */
  scrollIntoViewOnFocus?: boolean;
};

/**
 * Windows 등에서 한글 IME 조합 중 부모 state 갱신으로 조합이 끊기는 문제를 줄입니다.
 * 조합 중에는 로컬 값만 갱신하고, 조합 종료 후 부모로 동기화합니다.
 */
export function ImeTextInput({
  value,
  onChange,
  className,
  lang,
  scrollIntoViewOnFocus,
  onFocus,
  ...rest
}: Props) {
  const composing = useRef(false);
  const [inner, setInner] = useState(value);

  useEffect(() => {
    if (!composing.current) {
      setInner(value);
    }
  }, [value]);

  return (
    <input
      {...rest}
      {...(lang != null && lang !== '' ? { lang } : {})}
      className={className}
      value={inner}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(e) => {
        composing.current = false;
        const v = e.currentTarget.value;
        setInner(v);
        onChange(v);
      }}
      onFocus={(e) => {
        onFocus?.(e);
        if (scrollIntoViewOnFocus) {
          requestAnimationFrame(() => {
            setTimeout(() => {
              e.currentTarget.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
            }, 280);
          });
        }
      }}
      onChange={(e) => {
        const v = e.target.value;
        setInner(v);
        if (!composing.current) {
          onChange(v);
        }
      }}
    />
  );
}
