import axios from 'axios';

// In development Vite proxies /api to the local API. In production VITE_API_URL
// points at the deployed API, e.g. https://your-api.onrender.com/api (set at build time).
const api = axios.create({ baseURL: (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '') });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pd_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('pd_token');
      localStorage.removeItem('pd_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
