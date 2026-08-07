const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const AUTH_KEY = 'movie-night-auth';

/** Read/write the optional shared password (only used if the server requires it). */
export function getAuth() {
  try {
    return localStorage.getItem(AUTH_KEY) || '';
  } catch {
    return '';
  }
}
export function setAuth(value) {
  try {
    if (value) localStorage.setItem(AUTH_KEY, value);
    else localStorage.removeItem(AUTH_KEY);
  } catch {
    /* ignore storage errors */
  }
}

/**
 * Fetch wrapper with base URL handling and error checking.
 * Attaches the shared password (if one is stored) so an auth-enabled server
 * accepts the request. Throws on non-OK responses with the server's error
 * message; the thrown error carries `.status` so callers can react (e.g. 401).
 * Returns the raw Response object so callers can call .json() etc.
 */
export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const password = getAuth();
  if (password) headers['x-app-password'] = password;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    let body = null;
    try {
      body = await res.clone().json();
      if (body.error) message = body.error;
    } catch {}
    const err = new Error(message);
    err.status = res.status;
    // The whole payload, not just the message — some errors carry data the
    // caller needs to offer a way out (e.g. the 409 from re-matching a title
    // includes `conflictTitleId`, which becomes a "merge into it" button).
    err.body = body;
    throw err;
  }
  return res;
}
