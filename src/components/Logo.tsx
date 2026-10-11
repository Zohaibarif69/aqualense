export default function Logo({ light }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#087F8C" />
        <circle cx="16" cy="16" r="9" fill="none" stroke="#fff" strokeWidth="2.2" />
        <path d="M8 17.5c2.5-2 5-2 8 0s5.5 2 8 0" fill="none" stroke="#DDF3F2" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="16" cy="12" r="1.8" fill="#fff" />
      </svg>
      <span className={`text-[17px] font-bold tracking-tight ${light ? "text-white" : "text-navy"}`}>AquaLens</span>
    </span>
  );
}
