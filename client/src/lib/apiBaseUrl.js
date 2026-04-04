function normalizeBaseUrl(value) {
  if (!value || typeof value !== 'string') {
    return '/api';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '/api';
  }

  return trimmed.replace(/\/+$/, '');
}

export const apiBaseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);
