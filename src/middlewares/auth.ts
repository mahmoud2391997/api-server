import { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { collections, getCollection, type SchoolDocument, type StudentAccessDocument } from "../db/mongo.js";
import { logger } from "../lib/logger.js";

export function desktopApiKeyAuth(req: Request, res: Response, next: NextFunction) {
  if (req.method === "OPTIONS") return next();
  const expectedKey = process.env.api_key;
  const providedKey = req.header("X-App-API-Key");
  if (!expectedKey) return res.status(500).json({ error: "Server configuration error" });
  if (!providedKey) return res.status(401).json({ error: "Desktop API key is required" });
  const expected = Buffer.from(expectedKey); const provided = Buffer.from(providedKey);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) return res.status(403).json({ error: "Invalid desktop API key" });
  return next();
}

export interface AuthenticatedRequest extends Request { schoolId?: number; school?: { id: number; name: string; code: string }; role?: "admin" | "student"; }

export async function apiKeyAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const apiKey = req.headers["x-api-key"] as string | undefined;
  if (!apiKey) return res.status(401).json({ error: "API key is required" });
  try {
    const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
    const school = await (await getCollection<SchoolDocument>(collections.schools)).findOne({ apiKeyHash: keyHash });
    if (!school) return res.status(403).json({ error: "Invalid API key" });
    if (!school.isActive) return res.status(403).json({ error: "School is inactive" });
    req.schoolId = school.id; req.school = { id: school.id, name: school.name, code: school.code }; return next();
  } catch (error) { logger.error({ err: error }, "Authentication error"); return res.status(500).json({ error: "Authentication failed" }); }
}

export function optionalApiKeyAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) { return req.headers["x-api-key"] ? apiKeyAuth(req, res, next) : next(); }

export async function studentAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Authentication required" });
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ error: "Server configuration error" });
  try {
    const decoded = jwt.verify(authHeader.substring(7), secret) as { role: string; schoolId: number };
    if (decoded.role !== "student") return res.status(403).json({ error: "Invalid token" });
    const schools = await getCollection<SchoolDocument>(collections.schools);
    const school = await schools.findOne({ id: decoded.schoolId, isActive: true });
    if (!school) return res.status(403).json({ error: "School not found or inactive" });
    const access = await getCollection<StudentAccessDocument>(collections.studentAccess);
    if (!await access.findOne({ schoolId: decoded.schoolId, isActive: true })) return res.status(403).json({ error: "Student access not configured" });
    req.schoolId = school.id; req.school = { id: school.id, name: school.name, code: school.code }; req.role = "student"; return next();
  } catch (error) { logger.warn({ err: error }, "Student token verification failed"); return res.status(401).json({ error: "Invalid or expired token" }); }
}
