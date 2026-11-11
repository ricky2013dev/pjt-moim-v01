import { useEffect } from 'react';
import Icon from './Icon.jsx';

export function PinDots({ value, error }) {
  return (
    <div className={`flex justify-center gap-4 ${error ? 'animate-[shake_0.35s]' : ''}`}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={`size-4 rounded-full transition ${i < value.length ? 'scale-110 bg-brand-600' : 'bg-line'}`} />
      ))}
      <style>{'@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}'}</style>
    </div>
  );
}

export default function PinPad({ value, onChange, disabled }) {
  const press = (d) => !disabled && value.length < 4 && onChange(value + d);
  const del = () => !disabled && onChange(value.slice(0, -1));

  useEffect(() => {
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') del();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const key = 'grid h-16 place-items-center rounded-2xl text-2xl font-medium transition hover:bg-brand-50 active:scale-95 active:bg-brand-100 disabled:opacity-40';
  return (
    <div className="mx-auto grid max-w-xs grid-cols-3 gap-3">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
        <button key={d} type="button" className={`${key} bg-white ring-1 ring-line`} disabled={disabled} onClick={() => press(d)}>{d}</button>
      ))}
      <span />
      <button type="button" className={`${key} bg-white ring-1 ring-line`} disabled={disabled} onClick={() => press('0')}>0</button>
      <button type="button" className={`${key} text-muted`} disabled={disabled} onClick={del} aria-label="Delete">
        <Icon name="delete" className="size-7" strokeWidth={1.8} />
      </button>
    </div>
  );
}

// Simple 4-digit input for forms (numeric keyboard on phones).
export function PinInput({ value, onChange, ...rest }) {
  return (
    <input className="input text-center text-2xl tracking-[0.6em]" inputMode="numeric" pattern="\d{4}" maxLength={4}
      autoComplete="off" value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))} {...rest} />
  );
}
