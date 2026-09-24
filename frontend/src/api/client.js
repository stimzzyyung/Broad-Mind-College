// One small helper for talking to the backend. Every page uses this.
import { loadingBus } from '../lib/loadingBus.js';

const TOKEN_KEY = 'portal_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

const RAW_BACKEND_URL = import.meta.env.VITE_API_URL ?? 'https://broad-mind-college.onrender.com';
const BACKEND_URL = RAW_BACKEND_URL.replace(/\/+$/, '');
const API_BASE = BACKEND_URL.endsWith('/api') ? BACKEND_URL : `${BACKEND_URL}/api`;

async function request(path, { method = 'GET', body, asBlob = false } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  loadingBus.start();
  try {
    let res;
    try {
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      const url = `${API_BASE}${cleanPath}`;
      res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new Error('Cannot reach the server. Is the backend running?');
    }

    // Token expired or missing: send the person back to the login page
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      tokenStore.clear();
      window.location.href = '/login';
      throw new Error('Please log in again');
    }

    if (asBlob) {
      if (!res.ok) throw new Error('Could not download the file');
      return res.blob();
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Something went wrong');
    return data;
  } finally {
    loadingBus.stop();
  }
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE' }),

  // Downloads a file (like a PDF receipt) and saves it on the person's device
  async download(path, filename) {
    const blob = await request(path, { asBlob: true });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
