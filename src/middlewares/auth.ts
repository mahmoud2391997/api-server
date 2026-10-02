import { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { schoolsTable, studentAccessTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export function desktopApiKeyAuth(req: Request, res: Response, next: NextFunction) {
  if (req.method === "OPTIONS") {
    return next();
  }

  const expectedKey = process.env.api_key;
  const providedKey = req.header("X-App-API-Key");

  if (!expectedKey) {
    logger.error("api_key environment variable is not set");
    return res.status(500).json({ error: "Server configuration error" });
  }

  if (!providedKey) {
    logger.warn({ path: req.path }, "Desktop API key missing");
    return res.status(401).json({ error: "Desktop API key is required" });
  }

  const expectedBuffer = Buffer.from(expectedKey, "utf8");
  const providedBuffer = Buffer.from(providedKey, "utf8");

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    logger.warn({ path: req.path }, "Invalid desktop API key");
    return res.status(403).json({ error: "Invalid desktop API key" });
  }

  return next();
}

export interface AuthenticatedRequest extends Request {
  schoolId?: number;
  school?: {
    id: number;
    name: string;
    code: string;
  };
  role?: "admin" | "student";
}

export async function apiKeyAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const apiKey = req.headers["x-api-key"] as string;

  if (!apiKey) {
    logger.warn({ path: req.path }, "API key missing");
    return res.status(401).json({ error: "API key is required" });
  }

  try {
    const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
    const schools = await db
      .select()
      .from(schoolsTable)
      .where(eq(schoolsTable.apiKeyHash, keyHash))
      .limit(1);

    if (schools.length === 0) {
      logger.warn({ apiKeyPrefix: apiKey.substring(0, 8) + "..." }, "Invalid API key");
      return res.status(403).json({ error: "Invalid API key" });
    }

    const school = schools[0];

    if (!school.isActive) {
      logger.warn({ schoolId: school.id }, "School is inactive");
      return res.status(403).json({ error: "School is inactive" });
    }

    req.schoolId = school.id;
    req.school = {
      id: school.id,
      name: school.name,
      code: school.code,
    };

    return next();
  } catch (error) {
    logger.error({ err: error }, "Authentication error");
    return res.status(500).json({ error: "Authentication failed" });
  }
}

export function optionalApiKeyAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const apiKey = req.headers["x-api-key"] as string;

  if (!apiKey) {
    return next();
  }

  apiKeyAuth(req, res, next);
}

export async function studentAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    logger.warn({ path: req.path }, "Student token missing or invalid format");
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.substring(7);

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error("JWT_SECRET environment variable is not set");
      return res.status(500).json({ error: "Server configuration error" });
    }

    const decoded = jwt.verify(token, jwtSecret) as { role: string; schoolId: number };

    if (decoded.role !== "student") {
      logger.warn({ role: decoded.role }, "Invalid role in student token");
      return res.status(403).json({ error: "Invalid token" });
    }

    const school = await db
      .select()
      .from(schoolsTable)
      .where(and(eq(schoolsTable.id, decoded.schoolId), eq(schoolsTable.isActive, true)))
      .limit(1);

    if (school.length === 0) {
      logger.warn({ schoolId: decoded.schoolId }, "School not found or inactive");
      return res.status(403).json({ error: "School not found or inactive" });
    }

    const studentAccess = await db
      .select()
      .from(studentAccessTable)
      .where(and(eq(studentAccessTable.schoolId, decoded.schoolId), eq(studentAccessTable.isActive, true)))
      .limit(1);

    if (studentAccess.length === 0) {
      logger.warn({ schoolId: decoded.schoolId }, "Student access not configured for school");
      return res.status(403).json({ error: "Student access not configured" });
    }

    req.schoolId = decoded.schoolId;
    req.school = {
      id: school[0].id,
      name: school[0].name,
      code: school[0].code,
    };
    req.role = "student";

    return next();
  } catch (error) {
    logger.warn({ err: error }, "Student token verification failed");
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
