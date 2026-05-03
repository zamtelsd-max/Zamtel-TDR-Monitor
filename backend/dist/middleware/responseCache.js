"use strict";
/**
 * Simple in-process LRU-like response cache for read-heavy endpoints.
 * Each cached entry has a TTL. Cache is keyed by role+userId+url so users
 * always see their own scoped data. Mutations (POST/PATCH/DELETE) to the
 * same resource prefix automatically invalidate matching cache keys.
 *
 * This avoids hammering Neon at peak hour for data that changes at most
 * every few minutes (dashboards, leaderboards, zone stats, flags).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.responseCache = responseCache;
exports.invalidateCache = invalidateCache;
const store = new Map();
// Clean up expired entries every 2 minutes
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store) {
        if (v.expires < now)
            store.delete(k);
    }
}, 120000).unref();
/**
 * responseCache(ttlSeconds)
 * Caches GET responses for `ttlSeconds`. Uses the authenticated user ID
 * (if present) as part of the cache key so role-scoped data stays isolated.
 */
function responseCache(ttlSeconds) {
    return (req, res, next) => {
        if (req.method !== 'GET')
            return next();
        const userId = req.user?.userId || 'anon';
        const key = `${userId}::${req.originalUrl}`;
        const hit = store.get(key);
        if (hit && hit.expires > Date.now()) {
            res.setHeader('X-Cache', 'HIT');
            res.setHeader('Cache-Control', 'private, max-age=30');
            return res.status(hit.status).send(hit.body);
        }
        // Intercept res.json to capture the body
        const origJson = res.json.bind(res);
        res.json = (body) => {
            if (res.statusCode < 300) {
                const serialised = JSON.stringify(body);
                store.set(key, {
                    body: serialised,
                    status: res.statusCode,
                    expires: Date.now() + ttlSeconds * 1000,
                });
            }
            res.setHeader('X-Cache', 'MISS');
            return origJson(body);
        };
        next();
    };
}
/**
 * invalidateCache(prefix)
 * Call after any write to clear all cache entries whose key contains `prefix`.
 * e.g. invalidateCache('/api/v1/tdr') clears all TDR-scoped cache entries.
 */
function invalidateCache(prefix) {
    for (const k of store.keys()) {
        if (k.includes(prefix))
            store.delete(k);
    }
}
//# sourceMappingURL=responseCache.js.map