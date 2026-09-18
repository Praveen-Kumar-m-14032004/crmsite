/**
 * Tiny in-process memo for values that are expensive to compute and change only
 * on a known write. Invoice aggregates scan the whole table, so recomputing them
 * for every dashboard load is what makes the app crawl once there are tens of
 * thousands of rows.
 *
 * This lives in the Node process, so if the API is ever run as multiple workers
 * each holds its own copy – hence the TTL as a backstop alongside explicit
 * invalidation.
 */
const store = new Map();
const MAX_CACHE_SIZE = 200;

async function cached(key, ttlMs, compute) {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) {
    // LRU touch: delete and re-insert so the key moves to the end of iteration order
    store.delete(key);
    store.set(key, hit);
    return hit.value;
  }

  const value = await compute();

  // Evict oldest entry if cache is full (LRU eviction)
  if (store.size >= MAX_CACHE_SIZE) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }

  store.set(key, { value, at: Date.now() });
  return value;
}

function invalidate(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

module.exports = { cached, invalidate };
