/**
 * Reusable inline "couldn't load this" block with an optional retry button.
 * Use on any page where a data fetch can fail, so failures surface a message
 * and a way to recover instead of an empty or stale screen.
 */
export default function ErrorState({ message, onRetry }) {
  return (
    <div className="text-center py-16 text-slate-400">
      <div className="text-4xl mb-3">⚠️</div>
      <p className="font-medium text-slate-300">Couldn’t load this</p>
      <p className="text-sm mt-1 text-slate-500">
        {message || 'Check your connection and try again.'}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl px-5 py-2 text-sm font-medium transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  );
}
