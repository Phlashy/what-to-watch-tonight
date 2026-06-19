import { useLocation } from 'react-router-dom';

/**
 * Journey persistence: capture the current URL so a detail page (a title) can
 * return the user *exactly here* when they tap Back — including any query state
 * such as the Watch Log's `?tab=shows`.
 *
 * Why not just `navigate(-1)`? History-relative back is unreliable in the
 * installed PWA (home-screen launch, cold starts, and iOS standalone history
 * all corrupt the "go back one" assumption), so a title opened from a list
 * could dump you on the list-of-lists instead of the list. Passing the origin
 * explicitly via `location.state` makes "back to where you came from" exact.
 *
 * Usage:
 *   const fromState = useFromState();
 *   <Link to={`/title/${id}`} state={fromState}>…</Link>
 * and on the detail page, `location.state?.from` is the URL to return to.
 */
export function useFromState() {
  const location = useLocation();
  return { from: location.pathname + location.search };
}
