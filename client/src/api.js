const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/**
 * Fetch wrapper with base URL handling and error checking.
 * Throws on non-OK responses with the error message from the server.
 * Returns the raw Response object so callers can call .json() etc.
 */
export async function api(path, options) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try { const body = await res.clone().json(); if (body.error) message = body.error; } catch {}
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return res;
}
