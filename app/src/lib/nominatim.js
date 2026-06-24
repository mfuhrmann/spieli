const BASE_URL = 'https://nominatim.openstreetmap.org';
const DEFAULT_TIMEOUT_MS = 3000;

function getAcceptLanguage() {
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }
  return 'de';
}

export async function nominatimFetch(path, params = {}, { timeout = DEFAULT_TIMEOUT_MS, signal } = {}) {
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  if (!url.searchParams.has('format')) url.searchParams.set('format', 'json');
  if (!url.searchParams.has('accept-language')) {
    url.searchParams.set('accept-language', getAcceptLanguage());
  }

  const controller = new AbortController();
  const timer = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null;
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (timer) clearTimeout(timer);
    if (!res.ok) throw new Error(`Nominatim ${path}: ${res.status}`);
    return res.json();
  } catch (err) {
    if (timer) clearTimeout(timer);
    throw err;
  }
}
