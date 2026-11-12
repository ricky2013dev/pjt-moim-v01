import { useState } from 'react';
import { createPortal } from 'react-dom';
import { phonesOf, cleanPhone } from '../lib/api.js';
import Sheet from './Sheet.jsx';
import Icon from './Icon.jsx';

const hrefFor = (kind, phone) => (kind === 'call' ? `tel:${cleanPhone(phone)}` : `sms:${cleanPhone(phone)}`);

// A call or text button. With one number it's a plain link; with two it asks which one.
export default function PhoneAction({ member, kind, className, children, label }) {
  const [picking, setPicking] = useState(false);
  const phones = phonesOf(member);
  if (!phones.length) return null;
  const stop = (e) => e.stopPropagation();

  if (phones.length === 1) {
    return <a href={hrefFor(kind, phones[0].phone)} onClick={stop} className={className} aria-label={label}>{children}</a>;
  }
  return (
    <>
      <button type="button" className={className} aria-label={label}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPicking(true); }}>{children}</button>
      {/* Portaled out of any surrounding row link, and clicks stopped so they don't reach it through React. */}
      {picking && createPortal(
        <div onClick={stop}>
        <Sheet open onClose={() => setPicking(false)} title={`${kind === 'call' ? 'Call' : 'Text'} ${member.name}`}>
          <div className="space-y-2 pb-2">
            {phones.map(({ label: l, phone }) => (
              <a key={l} href={hrefFor(kind, phone)} onClick={() => setPicking(false)}
                className={`flex items-center gap-3 rounded-xl p-4 font-semibold ring-1 ring-line ${kind === 'call' ? 'bg-emerald-50 text-emerald-800' : 'bg-sky-50 text-sky-800'}`}>
                <Icon name={kind === 'call' ? 'phone' : 'sms'} className="size-5" />
                <span className="flex-1">{phone}</span>
                <span className="text-sm font-medium opacity-70">{l}</span>
              </a>
            ))}
          </div>
        </Sheet>
        </div>,
        document.body,
      )}
    </>
  );
}
