import { useState, useEffect, useRef } from 'react';
import { useFamily } from '../context/FamilyContext';

/**
 * Star button with a per-person shortlist popover, used on the Tonight cards.
 * Tapping toggles the current person's star; if the star belongs to someone
 * else (or no person is set) it opens a popover to pick who to shortlist for.
 */
export default function ShortlistButton({ shortlistedBy = [], onToggle, currentPerson }) {
  const { allPeople: PEOPLE } = useFamily();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const isMine = currentPerson && shortlistedBy.includes(currentPerson);
  const hasAny = shortlistedBy.length > 0;
  const starFilled = hasAny;

  function handleStarClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!currentPerson || (hasAny && !isMine)) {
      // No person set, or star belongs to someone else — show popover
      setOpen((o) => !o);
    } else {
      // Toggle for yourself (adding to empty, or removing your own)
      onToggle(currentPerson);
    }
  }

  function handleLongPress(e) {
    e.preventDefault();
    e.stopPropagation();
    setOpen((o) => !o);
  }

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={handleStarClick}
        onContextMenu={handleLongPress}
        aria-label={
          hasAny
            ? `Shortlisted by ${shortlistedBy.join(', ')} — edit shortlist`
            : 'Add to shortlist'
        }
        className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isMine ? 'text-amber-400' : hasAny ? 'text-amber-600' : 'text-slate-500 hover:text-slate-300'}`}
        title={
          currentPerson
            ? `Star for ${currentPerson} (right-click for all)`
            : 'Shortlist for someone'
        }
      >
        <svg
          className="w-5 h-5"
          fill={starFilled ? 'currentColor' : 'none'}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
          />
        </svg>
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 bottom-10 bg-slate-800 border border-slate-700 rounded-xl p-2 shadow-xl z-20 w-44"
        >
          <p className="text-xs text-slate-500 px-1 pb-1.5 font-medium">Shortlist for:</p>
          {PEOPLE.map((p) => {
            const on = shortlistedBy.includes(p);
            return (
              <button
                key={p}
                onClick={() => {
                  onToggle(p);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${on ? 'text-amber-400 bg-amber-500/10' : 'text-slate-300 hover:bg-slate-700'}`}
              >
                <svg
                  className="w-4 h-4 flex-shrink-0"
                  fill={on ? 'currentColor' : 'none'}
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                  />
                </svg>
                {p}
                {p === currentPerson && <span className="ml-auto text-xs text-slate-500">you</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
