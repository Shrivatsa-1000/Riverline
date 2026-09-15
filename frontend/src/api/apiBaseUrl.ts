const DEFAULT_API_BASE_URL = 'http://localhost:3000';

export function getApiBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL;

  if (typeof configuredBaseUrl === 'string' && configuredBaseUrl.trim()) {
    return configuredBaseUrl.replace(/\/$/, '');
  }

  return DEFAULT_API_BASE_URL;
}
