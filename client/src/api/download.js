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
  let newTab = null;
  if (typeof window !== 'undefined') {
    try {
      newTab = window.open('', '_blank');
      if (newTab && newTab.document) {
        newTab.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Preparing Invoice...</title>
<style>body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#343a40}
.box{text-align:center;padding:24px}.spinner{width:32px;height:32px;border:3px solid #e9d5ff;border-top-color:#6d2475;border-radius:50%;animation:s .6s linear infinite;margin:0 auto 12px}
@keyframes s{to{transform:rotate(360deg)}}.text{font-size:14px;font-weight:600;color:#6d2475}</style></head>
<body><div class="box"><div class="spinner"></div><div class="text">Opening Invoice PDF...</div></div></body></html>`);
      }
    } catch (_e) {
      newTab = null;
    }
  }

  try {
    const res = await api.get(path, { responseType: 'blob' });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    if (newTab && !newTab.closed) {
      newTab.location.href = url;
    } else {
      window.open(url, '_blank');
    }
  } catch (err) {
    if (newTab && !newTab.closed) {
      newTab.close();
    }
    throw err;
  }
}

