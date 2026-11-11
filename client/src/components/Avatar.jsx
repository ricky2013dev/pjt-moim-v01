const tints = ['bg-blue-100 text-blue-400', 'bg-indigo-100 text-indigo-400', 'bg-sky-100 text-sky-400',
  'bg-cyan-100 text-cyan-500', 'bg-slate-200 text-slate-400', 'bg-violet-100 text-violet-400'];

// Shows the member's photo, or a default person silhouette when they have none.
export default function Avatar({ member, size = 'size-12', className = '' }) {
  const tint = tints[(member?.id || 0) % tints.length];
  if (member?.photoUrl) {
    return <img src={member.photoUrl} alt="" className={`${size} shrink-0 rounded-full object-cover ring-2 ring-white ${className}`} />;
  }
  return (
    <div className={`${size} ${tint} relative shrink-0 overflow-hidden rounded-full ring-2 ring-white ${className}`}
      role="img" aria-label={member?.name || 'Member'}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 size-full" fill="currentColor" aria-hidden>
        <circle cx="20" cy="15.5" r="7.5" />
        <path d="M5 40c0-8.8 6.7-14.5 15-14.5S35 31.2 35 40z" />
      </svg>
    </div>
  );
}
