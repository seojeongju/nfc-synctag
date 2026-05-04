import { useEffect, useRef, useState } from 'react';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
};

/**
 * Windows 등에서 한글 IME 조합 중 부모 state 갱신으로 조합이 끊기는 문제를 줄입니다.
 * 조합 중에는 로컬 값만 갱신하고, 조합 종료 후 부모로 동기화합니다.
 */
export function ImeTextInput({ value, onChange, className, ...rest }: Props) {
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
      lang="ko"
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
