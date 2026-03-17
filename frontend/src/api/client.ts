import axios from 'axios';

const PROD_API_BASE_URL = 'https://ppf-backend-exsn.onrender.com';
const LOCAL_API_BASE_URL = 'http://localhost:8000';

// Prefer explicit env var. Otherwise default to localhost only when running locally,
// and to the Render backend when deployed.
export const API_BASE_URL = (() => {
  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  if (fromEnv) return fromEnv;
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  return isLocal ? LOCAL_API_BASE_URL : PROD_API_BASE_URL;
})();

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('ppf_token');
  config.headers = config.headers ?? {};
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      try {
        localStorage.removeItem('ppf_token');
      } catch {
        // ignore
      }
    }
    return Promise.reject(error);
  },
);

