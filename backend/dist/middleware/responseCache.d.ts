/**
 * Simple in-process LRU-like response cache for read-heavy endpoints.
 * Each cached entry has a TTL. Cache is keyed by role+userId+url so users
 * always see their own scoped data. Mutations (POST/PATCH/DELETE) to the
 * same resource prefix automatically invalidate matching cache keys.
 *
 * This avoids hammering Neon at peak hour for data that changes at most
 * every few minutes (dashboards, leaderboards, zone stats, flags).
 */
/**
 * responseCache(ttlSeconds)
 * Caches GET responses for `ttlSeconds`. Uses the authenticated user ID
 * (if present) as part of the cache key so role-scoped data stays isolated.
 */
export declare function responseCache(ttlSeconds: number): (req: any, res: any, next: any) => any;
/**
 * invalidateCache(prefix)
 * Call after any write to clear all cache entries whose key contains `prefix`.
 * e.g. invalidateCache('/api/v1/tdr') clears all TDR-scoped cache entries.
 */
export declare function invalidateCache(prefix: string): void;
//# sourceMappingURL=responseCache.d.ts.map