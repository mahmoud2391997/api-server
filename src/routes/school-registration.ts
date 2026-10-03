import { Router, type IRouter, type NextFunction, type Response } from "express";
import { z } from "zod";
import argon2 from "argon2";
import { collections, getCollection, nextId, type SchoolDocument, type StudentAccessDocument } from "../db/mongo.js";
import { type AuthenticatedRequest } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";
import crypto from "node:crypto";

const router: IRouter = Router();
const attempts = new Map<string, { count: number; resetAt: number }>();
function registrationRateLimit(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const now = Date.now(); const key = req.ip || req.socket.remoteAddress || "unknown"; const current = attempts.get(key);
  const attempt = !current || current.resetAt <= now ? { count: 1, resetAt: now + 900_000 } : { count: current.count + 1, resetAt: current.resetAt }; attempts.set(key, attempt);
  if (attempt.count > 5) { res.setHeader("Retry-After", Math.ceil((attempt.resetAt - now) / 1000)); res.status(429).json({ error: "Too many registration attempts" }); return; }
  next();
}
function generateApiKey() { return `sk-${crypto.randomBytes(32).toString("hex")}`; }

const registrationSchema = z.object({
  name: z.string().trim().min(1),
  nameArabic: z.string().trim().min(1),
  code: z.string().trim().min(1),
  address: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  email: z.string().optional().default(""),
  principalName: z.string().optional().default(""),
  establishedDate: z.string().nullable().optional().default(null),
  studentAccess: z.object({
    username: z.string().trim().min(3).max(80),
    password: z.string().min(8).max(256),
  }).optional(),
});

router.post("/register-school", registrationRateLimit, async (req, res) => {
  try {
    const secret = process.env.REGISTRATION_SECRET; const supplied = req.header("X-Registration-Secret");
    if (!secret || process.env.ALLOW_PUBLIC_REGISTRATION !== "true") {
      const a = Buffer.from(supplied || ""); const b = Buffer.from(secret || "");
      if (!supplied || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(403).json({ error: "Registration is protected" });
    }

    const parsed = registrationSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Name, nameArabic, and code are required; student credentials must have a username and a password of at least 8 characters" });
    const { name, nameArabic, code, address, phone, email, principalName, establishedDate, studentAccess } = parsed.data;
    const schools = await getCollection<SchoolDocument>(collections.schools);
    if (await schools.findOne({ code })) return res.status(409).json({ error: "School code already exists" });

    const apiKey = generateApiKey(); const now = new Date();
    const school = {
      id: await nextId("schools"), name, nameArabic, code, address, phone, email, principalName, establishedDate,
      apiKey: null, apiKeyHash: crypto.createHash("sha256").update(apiKey).digest("hex"), apiKeyPrefix: apiKey.slice(0, 11),
      isActive: true, createdAt: now, updatedAt: now,
    } as SchoolDocument;
    const passwordHash = studentAccess ? await argon2.hash(studentAccess.password) : null;

    await schools.insertOne(school);
    try {
      if (studentAccess && passwordHash) {
        await (await getCollection<StudentAccessDocument>(collections.studentAccess)).insertOne({
          id: await nextId("student_access"), schoolId: school.id, mode: "shared", username: studentAccess.username,
          passwordHash, isActive: true, createdAt: now, updatedAt: now,
        } as StudentAccessDocument);
      }
    } catch (error) {
      await schools.deleteOne({ id: school.id });
      throw error;
    }

    logger.info({ schoolId: school.id, code, studentAccessConfigured: Boolean(studentAccess) }, "New school registered");
    return res.status(201).json({
      school: { id: school.id, name, nameArabic, code },
      apiKey,
      studentAccess: studentAccess ? { username: studentAccess.username, configured: true } : { configured: false },
      message: "School registered successfully. Save your API key securely.",
    });
  } catch (error) { logger.error({ err: error }, "School registration error"); return res.status(500).json({ error: "Failed to register school" }); }
});

router.get("/school-info", async (req: AuthenticatedRequest, res) => {
  if (!req.schoolId) return res.status(401).json({ error: "Not authenticated" });
  try { const school = await (await getCollection<SchoolDocument>(collections.schools)).findOne({ id: req.schoolId }); if (!school) return res.status(404).json({ error: "School not found" }); const { apiKey: _apiKey, apiKeyHash: _hash, ...safe } = school; return res.json(safe); } catch (error) { logger.error({ err: error }, "Get school info error"); return res.status(500).json({ error: "Failed to get school info" }); }
});
export default router;
