function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  return match ? match[1] : null;
}

export async function apiFetch(url, options = {}) {
  const { method = 'GET', body, headers = {}, ...rest } = options;
  if (method !== 'GET' && method !== 'HEAD') {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }
  const res = await fetch(url, { method, headers, body, ...rest });
  return res;
}
