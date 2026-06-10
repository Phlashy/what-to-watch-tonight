import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

const ConfirmContext = createContext(null);

/**
 * App-styled replacement for the browser's native confirm()/alert().
 *
 * Provides a promise-based `confirm(options)` via the `useConfirm` hook:
 *   const confirm = useConfirm();
 *   if (!(await confirm({ message: 'Delete this?', destructive: true }))) return;
 *
 * For an alert-style notice (single button), pass `cancelLabel: null`.
 */
export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback(
    (options = {}) =>
      new Promise((resolve) => {
        resolverRef.current = resolve;
        setDialog({
          title: options.title || null,
          message: options.message || 'Are you sure?',
          confirmLabel: options.confirmLabel || 'Confirm',
          cancelLabel: options.cancelLabel === null ? null : options.cancelLabel || 'Cancel',
          destructive: !!options.destructive,
        });
      }),
    []
  );

  const close = useCallback((result) => {
    setDialog(null);
    resolverRef.current?.(result);
    resolverRef.current = null;
  }, []);

  useEffect(() => {
    if (!dialog) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-6"
          onClick={() => close(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xs p-5 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {dialog.title && (
              <h2 className="text-base font-bold text-white mb-1">{dialog.title}</h2>
            )}
            <p className="text-sm text-slate-300">{dialog.message}</p>
            <div className="flex gap-2 mt-5">
              {dialog.cancelLabel && (
                <button
                  onClick={() => close(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl py-2.5 text-sm font-medium transition-colors"
                >
                  {dialog.cancelLabel}
                </button>
              )}
              <button
                onClick={() => close(true)}
                autoFocus
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                  dialog.destructive
                    ? 'bg-red-500 hover:bg-red-400 text-white'
                    : 'bg-amber-500 hover:bg-amber-400 text-black'
                }`}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
