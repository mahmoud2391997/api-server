import { Router, type IRouter } from "express";
import { z } from "zod";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { collections, getCollection, type BookDocument, type SchoolDocument, type StudentAccessDocument } from "../db/mongo.js";
import type { AuthenticatedRequest } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();
router.post("/login", async (req, res): Promise<void> => {
  const parsed = z.object({ schoolCode: z.string().min(1), password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }
  try {
    const school = await (await getCollection<SchoolDocument>(collections.schools)).findOne({ code: parsed.data.schoolCode, isActive: true });
    const access = school ? await (await getCollection<StudentAccessDocument>(collections.studentAccess)).findOne({ schoolId: school.id, isActive: true }) : null;
    if (!school || !access || !await argon2.verify(access.passwordHash, parsed.data.password)) { res.status(401).json({ error: "Invalid credentials" }); return; }
    const secret = process.env.JWT_SECRET; if (!secret) { res.status(500).json({ error: "Server configuration error" }); return; }
    res.json({ token: jwt.sign({ role: "student", schoolId: school.id }, secret, { expiresIn: "2h" }) });
  } catch (error) { logger.error({ err: error }, "Student login error"); res.status(500).json({ error: "Login failed" }); }
});
function schoolId(req: AuthenticatedRequest, res: any): number | null { if (!req.schoolId) { res.status(401).json({ error: "Not authenticated" }); return null; } return req.schoolId; }
router.get("/library/books", async (req, res): Promise<void> => {
  const id = schoolId(req as AuthenticatedRequest, res); if (id === null) return;
  const parsed = z.object({ search: z.string().optional(), category: z.string().optional(), language: z.string().optional(), available: z.string().optional() }).safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Invalid query parameters" }); return; }
  const q: Record<string, unknown> = { schoolId: id }; const { search, category, language, available } = parsed.data;
  if (category) q.category = category; if (language) q.language = language; if (available === "true") q.$expr = { $eq: ["$availableCopies", "$copies"] };
  if (search) q.$or = [{ title: { $regex: search, $options: "i" } }, { author: { $regex: search, $options: "i" } }, { isbn: { $regex: search, $options: "i" } }];
  res.json(await (await getCollection<BookDocument>(collections.books)).find(q).sort({ title: 1 }).project({ _id: 0 }).toArray());
});
router.get("/library/books/:id", async (req, res): Promise<void> => {
  const id = schoolId(req as AuthenticatedRequest, res); if (id === null) return; const bookId = Number(req.params.id);
  if (!Number.isInteger(bookId) || bookId < 1) { res.status(400).json({ error: "Invalid book ID" }); return; }
  const book = await (await getCollection<BookDocument>(collections.books)).findOne({ id: bookId, schoolId: id }, { projection: { _id: 0 } });
  if (!book) { res.status(404).json({ error: "Book not found" }); return; } res.json(book);
});
export default router;
