const tints = ['bg-blue-100 text-blue-700', 'bg-indigo-100 text-indigo-700', 'bg-sky-100 text-sky-700',
  'bg-cyan-100 text-cyan-700', 'bg-slate-200 text-slate-700', 'bg-violet-100 text-violet-700'];

export default function Avatar({ member, size = 'size-12', className = '' }) {
  const name = member?.name || '?';
  const initials = name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const tint = tints[(member?.id || 0) % tints.length];
  if (member?.photoUrl) {
    return <img src={member.photoUrl} alt="" className={`${size} shrink-0 rounded-full object-cover ring-2 ring-white ${className}`} />;
  }
  return (
    <div className={`${size} ${tint} grid shrink-0 place-items-center rounded-full font-bold ring-2 ring-white ${className}`}>
      <span className="text-[0.9em]">{initials}</span>
    </div>
  );
}
