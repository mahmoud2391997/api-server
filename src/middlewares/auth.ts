import { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import { schoolsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export interface AuthenticatedRequest extends Request {
  schoolId?: number;
  school?: {
    id: number;
    name: string;
    code: string;
  };
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
