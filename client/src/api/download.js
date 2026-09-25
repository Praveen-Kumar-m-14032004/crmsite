import api from './axios';

// Auth is via a Bearer header, so plain <a href> links can't carry it -
// fetch as a blob through axios instead and trigger the save manually.
export async function downloadViaApi(path, params, filename) {
  const res = await api.get(path, { params, responseType: 'blob' });
  const blob = new Blob([res.data], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function prefetchPdf() {}
export function batchPrefetchPdfs() {}
export function cancelBatchPrefetch() {}
export function invalidatePdfCache() {}

export async function openViaApi(path) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('pd_token') : null;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const apiPath = cleanPath.startsWith('/api') ? cleanPath : `/api${cleanPath}`;
  const urlWithToken = token
    ? `${apiPath}${apiPath.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
    : apiPath;

  const win = typeof window !== 'undefined' ? window.open(urlWithToken, '_blank') : null;
  if (!win || win.closed || typeof win.closed === 'undefined') {
    try {
      const res = await api.get(cleanPath, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (err) {
      throw err;
    }
  }
}

