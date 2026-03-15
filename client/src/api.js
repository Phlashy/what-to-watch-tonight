const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export function api(path, options) {
  return fetch(`${BASE}${path}`, options);
}
