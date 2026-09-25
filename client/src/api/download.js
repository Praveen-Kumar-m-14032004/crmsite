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
  const cleanPath = path.startsWith('/api') ? path.replace(/^\/api/, '') : path;

  // Pre-open a tab synchronously within user gesture to avoid popup blockers
  let win = null;
  if (typeof window !== 'undefined') {
    try {
      win = window.open('about:blank', '_blank');
    } catch (_e) {
      win = null;
    }
  }

  try {
    const res = await api.get(cleanPath, { responseType: 'blob' });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const blobUrl = window.URL.createObjectURL(blob);

    if (win && !win.closed) {
      win.location.href = blobUrl;
    } else {
      window.open(blobUrl, '_blank');
    }
  } catch (err) {
    if (win && !win.closed) {
      win.close();
    }
    throw err;
  }
}

