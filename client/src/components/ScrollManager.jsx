import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Restores window scroll position on back/forward navigation, and scrolls to the
 * top on new (push) navigations — so tapping into a title and pressing Back returns
 * you to where you were, not the top of the list.
 *
 * Implementation notes (both matter, and both bit us):
 *  - We can't rely on 'scroll' events: some platforms don't emit them for
 *    programmatic scrolling, leaving us nothing to record.
 *  - We can't read scrollY in an effect cleanup either: by the time the cleanup
 *    runs, React has already swapped in the (often shorter) next page and the
 *    browser has clamped scrollY to the new document height — so we'd record 0.
 *
 * So we poll scrollY every animation frame and stash it under the *current*
 * history key. The last frame before a navigation freezes the right value; once
 * the key changes, subsequent (clamped) reads land under the new key instead.
 *
 * Pages re-fetch on mount, so a restored position may not be reachable
 * immediately; we retry each frame (up to ~1s) until the content is tall enough.
 */
export default function ScrollManager() {
  const { key } = useLocation();
  const navType = useNavigationType();
  const positions = useRef(new Map());
  const keyRef = useRef(key);
  keyRef.current = key;

  // Take over scroll restoration from the browser (its native attempt fails for
  // async-rendered SPA content).
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  // Continuously record the live scroll position against the current history key.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      positions.current.set(keyRef.current, window.scrollY);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // On arrival: restore on back/forward (POP), otherwise go to the top.
  useEffect(() => {
    const target = navType === 'POP' ? (positions.current.get(key) ?? 0) : 0;
    if (target === 0) {
      window.scrollTo(0, 0);
      return undefined;
    }
    const deadline = Date.now() + 1000;
    let raf = 0;
    const restore = () => {
      window.scrollTo(0, target);
      if (Math.abs(window.scrollY - target) > 2 && Date.now() < deadline) {
        raf = requestAnimationFrame(restore);
      }
    };
    raf = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(raf);
  }, [key, navType]);

  return null;
}
