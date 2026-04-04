function normalizeBaseUrl(value) {
  if (!value || typeof value !== 'string') {
    return '/api';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '/api';
  }

  if (trimmed.startsWith('/')) {
    const normalizedPath = trimmed.replace(/\/+$/, '');
    return normalizedPath.endsWith('/api') ? normalizedPath : `${normalizedPath}/api`;
  }

  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname.replace(/\/+$/, '');

    if (!pathname || pathname === '') {
      parsed.pathname = '/api';
    } else if (!pathname.endsWith('/api')) {
      parsed.pathname = `${pathname}/api`;
    } else {
      parsed.pathname = pathname;
    }

    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
  } catch (_error) {
    const normalizedPath = trimmed.replace(/\/+$/, '');
    return normalizedPath.endsWith('/api') ? normalizedPath : `${normalizedPath}/api`;
  }
}

export const apiBaseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);
