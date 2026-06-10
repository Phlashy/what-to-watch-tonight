/**
 * Compact, accessible sort control — a styled native <select> (keyboard- and
 * screen-reader-friendly out of the box). Reused across Lists, ListDetail, and
 * Collection.
 */
export default function SortSelect({
  value,
  onChange,
  options,
  label = 'Sort by',
  className = '',
}) {
  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="appearance-none bg-slate-800 text-slate-200 text-xs font-medium rounded-full pl-3 pr-8 py-1.5 outline-none focus:ring-2 ring-amber-500 hover:bg-slate-700 cursor-pointer transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2.5 w-3.5 h-3.5 text-slate-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}
