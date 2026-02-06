import { NextResponse } from 'next/server';

/**
 * Simple in-memory sliding-window rate limiter for agent endpoints.
 *
 * Limits requests per workspace to prevent abuse. Each Vercel serverless
 * instance maintains its own window, so this is best-effort protection
 * suitable for MVP. For stricter enforcement, use Redis-backed rate limiting.
 */

interface RateLimitEntry {
    timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

const DEFAULT_WINDOW_MS = 60_000; // 1 minute
const DEFAULT_MAX_REQUESTS = 30;  // 30 requests per minute per workspace

// Clean up stale entries every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL_MS = 5 * 60_000;
let lastCleanup = Date.now();

function cleanupStaleEntries(windowMs: number) {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;

    lastCleanup = now;
    const cutoff = now - windowMs;
    for (const [key, entry] of store) {
        entry.timestamps = entry.timestamps.filter(t => t > cutoff);
        if (entry.timestamps.length === 0) {
            store.delete(key);
        }
    }
}

export interface RateLimitOptions {
    windowMs?: number;
    maxRequests?: number;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetMs: number;
}

/**
 * Check if a request from a given workspace is within the rate limit.
 */
export function checkRateLimit(
    workspaceId: string,
    options: RateLimitOptions = {}
): RateLimitResult {
    const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
    const now = Date.now();
    const cutoff = now - windowMs;

    cleanupStaleEntries(windowMs);

    let entry = store.get(workspaceId);
    if (!entry) {
        entry = { timestamps: [] };
        store.set(workspaceId, entry);
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);

    if (entry.timestamps.length >= maxRequests) {
        const oldestInWindow = entry.timestamps[0];
        return {
            allowed: false,
            remaining: 0,
            resetMs: oldestInWindow + windowMs - now,
        };
    }

    entry.timestamps.push(now);
    return {
        allowed: true,
        remaining: maxRequests - entry.timestamps.length,
        resetMs: windowMs,
    };
}

/**
 * Middleware helper: returns a 429 response if rate-limited, or null if allowed.
 */
export function rateLimitResponse(
    workspaceId: string,
    options?: RateLimitOptions
): NextResponse | null {
    const result = checkRateLimit(workspaceId, options);

    if (!result.allowed) {
        return NextResponse.json(
            { error: 'Rate limit exceeded. Try again later.' },
            {
                status: 429,
                headers: {
                    'Retry-After': String(Math.ceil(result.resetMs / 1000)),
                    'X-RateLimit-Remaining': '0',
                },
            }
        );
    }

    return null;
}
