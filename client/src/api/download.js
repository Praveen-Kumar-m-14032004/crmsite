import api from './axios';

// Auth is via a Bearer header, so plain <a href> links can't carry it -
// fetch as a blob through axios instead and trigger the save manually.
export async function downloadViaApi(path, params, filename) {
  const res = await api.get(path, { params, responseType: 'blob' });
  const blob = new Blob([res.data]);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/* ---- Client-side PDF blob cache ---- */
const pdfBlobCache = new Map();
const MAX_CACHE = 50;
const inflight = new Map();

function cacheSet(path, url) {
  if (pdfBlobCache.size >= MAX_CACHE) {
    const oldest = pdfBlobCache.keys().next().value;
    const oldUrl = pdfBlobCache.get(oldest);
    pdfBlobCache.delete(oldest);
    try { window.URL.revokeObjectURL(oldUrl); } catch (_) {}
  }
  pdfBlobCache.set(path, url);
}

async function fetchPdfBlob(path) {
  const res = await api.get(path, { responseType: 'blob' });
  const blob = new Blob([res.data], { type: 'application/pdf' });
  return window.URL.createObjectURL(blob);
}

/**
 * Pre-fetch a PDF in the background (call on hover).
 * Returns silently if already cached or fetch fails.
 */
export function prefetchPdf(path) {
  if (pdfBlobCache.has(path) || inflight.has(path)) return;
  const promise = fetchPdfBlob(path)
    .then((url) => { cacheSet(path, url); })
    .catch(() => {})
    .finally(() => { inflight.delete(path); });
  inflight.set(path, promise);
}

/**
 * Invalidate a cached PDF (call after invoice update).
 */
export function invalidatePdfCache(path) {
  const url = pdfBlobCache.get(path);
  if (url) {
    try { window.URL.revokeObjectURL(url); } catch (_) {}
    pdfBlobCache.delete(path);
  }
}

export async function openViaApi(path) {
  // If already cached, open instantly — no network, no loader needed
  const cached = pdfBlobCache.get(path);
  if (cached) {
    window.open(cached, '_blank');
    return;
  }

  // If prefetch is in-flight, wait for it
  const pending = inflight.get(path);
  if (pending) {
    await pending;
    const url = pdfBlobCache.get(path);
    if (url) {
      window.open(url, '_blank');
      return;
    }
  }

  // Cold path: open tab with loader, fetch, redirect
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
    const url = await fetchPdfBlob(path);
    cacheSet(path, url);
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
