// Tiny in-memory IP rate limiter.
//
// Scope: protect LLM-backed routes from accidental loops or casual abuse
// while the app is in soft-launch to ~25 users. NOT a real rate limiter —
// Vercel serverless instances are ephemeral, so state resets every cold
// start and each instance tracks its own counters. That's acceptable as a
// smoke shield; for real limiting we'd need Upstash Redis or Vercel KV.
//
// Usage at the top of a route handler:
//   const hit = rateLimit(req, { limit: 10, windowMs: 60_000 });
//   if (hit.blocked) return hit.response;
//
// Tune per-route. Default: 20 req / 60s / IP.

import type { NextRequest } from "next/server";

type Bucket = { count: number; resetAt: number };

// Module-level Map persists across requests within the same serverless
// instance. Keys are "<route>:<ip>" so two routes don't share a bucket.
const buckets = new Map<string, Bucket>();

// Periodic cleanup so the Map doesn't grow unbounded over a long-lived
// instance. Runs at most once per minute.
let lastSweep = 0;
function maybeSweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

function clientIp(req: NextRequest): string {
  // Vercel sets x-forwarded-for; take the first (leftmost = client).
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export interface RateLimitOptions {
  limit: number;      // max requests per window
  windowMs: number;   // window length in ms
  routeKey?: string;  // bucket namespace — defaults to URL pathname
}

export interface RateLimitResult {
  blocked: boolean;
  remaining: number;
  resetAt: number;
  response: Response; // 429 response ready to return when blocked
}

export function rateLimit(req: NextRequest, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  maybeSweep(now);

  const ip = clientIp(req);
  const route = opts.routeKey ?? new URL(req.url).pathname;
  const key = `${route}:${ip}`;

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + opts.windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;

  const blocked = bucket.count > opts.limit;
  const remaining = Math.max(0, opts.limit - bucket.count);
  const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

  const response = blocked
    ? new Response(
        JSON.stringify({
          error: "Too many requests. Slow down a moment.",
          retryAfterSec,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfterSec),
            "X-RateLimit-Limit": String(opts.limit),
            "X-RateLimit-Remaining": String(remaining),
            "X-RateLimit-Reset": String(Math.ceil(bucket.resetAt / 1000)),
          },
        },
      )
    : new Response(null); // unused when not blocked

  return { blocked, remaining, resetAt: bucket.resetAt, response };
}
