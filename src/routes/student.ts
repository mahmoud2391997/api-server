import { Router, type IRouter } from "express";
import { z } from "zod";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { studentAccessTable } from "@workspace/db/schema";
import { collections, getCollection, type BookDocument, type SchoolDocument, type StudentAccessDocument, type StudentDocument } from "../db/mongo.js";
import type { AuthenticatedRequest } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();
router.post("/login", async (req, res): Promise<void> => {
  const parsed = z.object({ schoolCode: z.string().trim().min(1), username: z.string().trim().max(80).optional(), password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }
  try {
    const school = await (await getCollection<SchoolDocument>(collections.schools)).findOne({ code: parsed.data.schoolCode, isActive: true });
    if (!school) { res.status(401).json({ error: "Invalid credentials" }); return; }
    const accesses = await getCollection<StudentAccessDocument>(collections.studentAccess);
    const username = parsed.data.username?.trim().toLowerCase();
    let access: StudentAccessDocument | null = null;
    let student: StudentDocument | null = null;
    if (username) {
      const candidate = await accesses.findOne({ schoolId: school.id, mode: "individual", username, isActive: true });
      if (candidate?.studentId) {
        student = await (await getCollection<StudentDocument>(collections.students)).findOne({ id: candidate.studentId, schoolId: school.id, status: "active" });
        if (student && await argon2.verify(candidate.passwordHash, parsed.data.password)) access = candidate;
      }
    }
    // Preserve legacy shared accounts, while honoring usernames provisioned during school registration.
    let sharedAuthenticated = false;
    let sharedUsername: string | undefined;
    if (!access) {
      const legacyShared = await accesses.findOne({ schoolId: school.id, mode: { $ne: "individual" }, isActive: true });
      const requestedUsername = username?.toLowerCase();
      const usernameMatches = !legacyShared?.username || requestedUsername === legacyShared.username.toLowerCase();
      const [shared] = await db.select().from(studentAccessTable).where(and(
        eq(studentAccessTable.schoolId, school.id),
        eq(studentAccessTable.mode, "shared"),
        eq(studentAccessTable.isActive, true),
      )).limit(1);
      const relationalMatch = Boolean(shared && usernameMatches && await argon2.verify(shared.passwordHash, parsed.data.password));
      const legacyMatch = Boolean(legacyShared && usernameMatches && await argon2.verify(legacyShared.passwordHash, parsed.data.password));
      sharedAuthenticated = relationalMatch || legacyMatch;
      if (sharedAuthenticated) sharedUsername = legacyShared?.username;
    }
    if (!access && !sharedAuthenticated) { res.status(401).json({ error: "Invalid credentials" }); return; }
    const secret = process.env.JWT_SECRET; if (!secret) { res.status(500).json({ error: "Server configuration error" }); return; }
    const tokenPayload: { role: string; schoolId: number; studentId?: number } = { role: "student", schoolId: school.id };
    if (access?.mode === "individual" && student) tokenPayload.studentId = student.id;
    res.json({
      token: jwt.sign(tokenPayload, secret, { expiresIn: "2h" }),
      school: { name: school.name, code: school.code },
      student: access?.mode === "individual" && student
        ? { id: student.id, username: access.username, fullName: student.fullName }
        : { username: sharedUsername || "student" },
    });
  } catch (error) { logger.error({ err: error }, "Student login error"); res.status(500).json({ error: "Login failed" }); }
});
function schoolId(req: AuthenticatedRequest, res: any): number | null { if (!req.schoolId) { res.status(401).json({ error: "Not authenticated" }); return null; } return req.schoolId; }
router.get("/library/books", async (req, res): Promise<void> => {
  const id = schoolId(req as AuthenticatedRequest, res); if (id === null) return;
  const parsed = z.object({ search: z.string().optional(), category: z.string().optional(), language: z.string().optional(), available: z.string().optional() }).safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Invalid query parameters" }); return; }
  const q: Record<string, unknown> = { schoolId: id, availableCopies: { $gt: 0 } }; const { search, category, language } = parsed.data;
  if (category) q.category = category; if (language) q.language = language;
  if (search) q.$or = [{ title: { $regex: search, $options: "i" } }, { author: { $regex: search, $options: "i" } }, { isbn: { $regex: search, $options: "i" } }];
  res.json(await (await getCollection<BookDocument>(collections.books)).find(q).sort({ title: 1 }).project({ _id: 0 }).toArray());
});
router.get("/library/books/:id", async (req, res): Promise<void> => {
  const id = schoolId(req as AuthenticatedRequest, res); if (id === null) return; const bookId = Number(req.params.id);
  if (!Number.isInteger(bookId) || bookId < 1) { res.status(400).json({ error: "Invalid book ID" }); return; }
  const book = await (await getCollection<BookDocument>(collections.books)).findOne({ id: bookId, schoolId: id, availableCopies: { $gt: 0 } }, { projection: { _id: 0 } });
  if (!book) { res.status(404).json({ error: "Book not found" }); return; } res.json(book);
});
export default router;
