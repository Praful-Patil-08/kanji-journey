'use strict';

// Simple in-memory rate limiter — per IP, per route prefix
// Not for distributed deployments, but sufficient for portfolio demo and prevents abuse

const stores = new Map(); // key → { count, resetAt }

function rateLimit({ windowMs = 60_000, max = 30, keyPrefix = 'global' } = {}) {
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    let entry = stores.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      stores.set(key, entry);
    }
    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
    if (entry.count > max) {
      return res.status(429).json({ error: 'Too many requests, please slow down', code: 'RATE_LIMITED' });
    }
    next();
  };
}

// For testing: clear all stores
function _clearAll() {
  stores.clear();
}

module.exports = { rateLimit, _clearAll };
