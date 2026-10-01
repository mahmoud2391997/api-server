import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { schoolsTable } from "@workspace/db/schema";
import { type AuthenticatedRequest } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";
import crypto from "crypto";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// Generate a secure API key
function generateApiKey(): string {
  return `sk-${crypto.randomBytes(32).toString('hex')}`;
}

// Register a new school (first-time setup)
router.post("/register-school", async (req: AuthenticatedRequest, res): Promise<any> => {
  try {
    const registrationSecret = process.env.REGISTRATION_SECRET;
    if (!registrationSecret || process.env.ALLOW_PUBLIC_REGISTRATION !== "true") {
      const supplied = req.header("X-Registration-Secret");
      const suppliedBuffer = Buffer.from(supplied || "");
      const expectedBuffer = Buffer.from(registrationSecret || "");
      if (!supplied || suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
        return res.status(403).json({ error: "Registration is protected" });
      }
    }
    const { name, nameArabic, code, address, phone, email, principalName, establishedDate } = req.body;

    if (!name || !nameArabic || !code) {
      return res.status(400).json({ error: "Name, nameArabic, and code are required" });
    }

    // Check if school code already exists
    const existingSchool = await db
      .select()
      .from(schoolsTable)
      .where(eq(schoolsTable.code, code))
      .limit(1);

    if (existingSchool.length > 0) {
      return res.status(409).json({ error: "School code already exists" });
    }

    const apiKey = generateApiKey();
    const apiKeyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

    const newSchool = await db
      .insert(schoolsTable)
      .values({
        name,
        nameArabic,
        code,
        address: address || "",
        phone: phone || "",
        email: email || "",
        principalName: principalName || "",
        establishedDate: establishedDate || null,
        apiKey: null,
        apiKeyHash,
        apiKeyPrefix: apiKey.slice(0, 11),
        isActive: true,
      })
      .returning();

    logger.info({ schoolId: newSchool[0].id, code }, "New school registered");

    res.status(201).json({
      school: {
        id: newSchool[0].id,
        name: newSchool[0].name,
        nameArabic: newSchool[0].nameArabic,
        code: newSchool[0].code,
      },
      apiKey,
      message: "School registered successfully. Save your API key securely.",
    });
  } catch (error) {
    logger.error({ err: error }, "School registration error");
    res.status(500).json({ error: "Failed to register school" });
  }
});

// Get current school info (requires auth)
router.get("/school-info", async (req: AuthenticatedRequest, res): Promise<any> => {
  try {
    if (!req.schoolId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const schools = await db
      .select()
      .from(schoolsTable)
      .where(eq(schoolsTable.id, req.schoolId))
      .limit(1);

    if (schools.length === 0) {
      return res.status(404).json({ error: "School not found" });
    }

    const school = schools[0];

    res.json({
      id: school.id,
      name: school.name,
      nameArabic: school.nameArabic,
      code: school.code,
      address: school.address,
      phone: school.phone,
      email: school.email,
      principalName: school.principalName,
      establishedDate: school.establishedDate,
      isActive: school.isActive,
      createdAt: school.createdAt,
    });
  } catch (error) {
    logger.error({ err: error }, "Get school info error");
    res.status(500).json({ error: "Failed to get school info" });
  }
});

export default router;
