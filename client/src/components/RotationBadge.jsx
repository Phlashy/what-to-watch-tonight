/**
 * "Next to choose" banner for the family movie-night rotation, with a Skip control.
 */
export default function RotationBadge({ rotation, onSkip, skipping }) {
  if (!rotation) return null;
  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs text-amber-400 font-medium block">Next to choose</span>
          <span className="text-xl font-bold text-amber-300">{rotation.nextChooser}</span>
          {rotation.skipped && <span className="text-xs text-slate-500 ml-2">(skip override)</span>}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="text-xs text-slate-500">{rotation.rotation.join(' → ')}</span>
          <button
            onClick={onSkip}
            disabled={skipping}
            className="text-xs text-slate-400 hover:text-amber-400 disabled:opacity-40 transition-colors flex items-center gap-1 bg-slate-800 rounded-full px-2.5 py-1"
          >
            Skip {rotation.nextChooser}
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
      {rotation.lastChooser && (
        <p className="text-xs text-slate-500 mt-1">Last chose: {rotation.lastChooser}</p>
      )}
    </div>
  );
}
