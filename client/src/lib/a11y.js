import { useEffect } from 'react';

/**
 * Call `onEscape` whenever the Escape key is pressed while the component is
 * mounted. Used to make modals dismissible from the keyboard.
 */
export function useOnEscape(onEscape) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEscape]);
}
