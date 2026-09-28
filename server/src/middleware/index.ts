import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { AppError, ERROR_MESSAGES } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { safeTimeZone } from "../lib/dates.js";
import { SESSION_COOKIE, userFromSession, type PublicUser } from "../services/authService.js";

// ─── Request logging (method, path, status, duration — never query strings or bodies) ──
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    if (!req.path.startsWith("/api")) return;
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info("http", { method: req.method, path: req.path, status: res.statusCode, ms: Math.round(ms) });
  });
  next();
}

// ─── Rate limits (protect this server and, indirectly, the YouTube API quota) ─────
const skipInTests = () => env.nodeEnv === "test";
const limitHandler = (_req: Request, res: Response) =>
  res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down and try again shortly." } });
const limiter = (windowMs: number, limit: number) =>
  rateLimit({ windowMs, limit, standardHeaders: "draft-7", legacyHeaders: false, handler: limitHandler, skip: skipInTests });

export const apiLimiter = limiter(60_000, 400);
export const searchLimiter = limiter(60_000, 40);
export const agentLimiter = limiter(60_000, 20);
export const loginLimiter = limiter(15 * 60_000, 10);

// ─── Dashboard authentication (signed HttpOnly session cookie) ──────────────
declare module "express-serve-static-core" {
  interface Request {
    user?: PublicUser;
  }
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) {
      try {
        return decodeURIComponent(v.join("="));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  try {
    req.user = (await userFromSession(readCookie(req, SESSION_COOKIE))) ?? undefined;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (req.user) return next();
  next(new AppError("UNAUTHORIZED"));
}

/** The signed-in user's id (routes behind requireAuth only). */
export const uid = (req: Request) => req.user!.id;

export function tzOf(req: Request): string {
  return safeTimeZone(req.query.tz ?? req.body?.tz ?? req.headers["x-timezone"]);
}

// ─── Errors: sanitized JSON, never stack traces or upstream payloads ────────────
export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Endpoint not found." } });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    if (err.retryAfterSeconds) res.setHeader("Retry-After", String(err.retryAfterSeconds));
    return res.status(err.status).json({ error: { code: err.code, message: err.userMessage } });
  }
  if (err && typeof err === "object" && (err as { type?: string }).type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "INVALID_INPUT", message: "Malformed JSON body." } });
  }
  if (err && typeof err === "object" && (err as { name?: string }).name === "ZodError") {
    const issue = (err as { issues?: { message?: string; path?: unknown[] }[] }).issues?.[0];
    return res.status(400).json({ error: { code: "INVALID_INPUT", message: issue?.message ? `${issue.path?.join(".") || "input"}: ${issue.message}` : ERROR_MESSAGES.INVALID_INPUT } });
  }
  logger.error("unhandled_error", { path: req.path, error: String((err as Error)?.stack ?? err) });
  res.status(500).json({ error: { code: "INTERNAL", message: ERROR_MESSAGES.INTERNAL } });
}
