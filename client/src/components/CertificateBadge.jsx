/**
 * The US age certificate — "PG", "PG-13", "R" for films; "TV-14", "TV-MA" for
 * shows. Drawn as an outlined chip rather than plain text so it reads as an
 * official marking at a glance while scanning a list, and doesn't compete with
 * the coloured Rotten Tomatoes and star ratings beside it.
 *
 * Renders nothing when we have no certificate — plenty of titles legitimately
 * lack one (older films, foreign releases, anything OMDb has no record for), and
 * an empty box would be worse than silence.
 */
export default function CertificateBadge({ rating, className = '' }) {
  if (!rating) return null;

  return (
    <span
      className={`inline-flex items-center px-1.5 py-px rounded border border-slate-600 text-slate-300 text-[0.65rem] font-semibold tracking-wide leading-tight ${className}`}
      title={`Rated ${rating}`}
    >
      {rating}
    </span>
  );
}
