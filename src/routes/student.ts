import { Router, type IRouter } from "express";
import { and, eq, ilike, or } from "drizzle-orm";
import { db } from "@workspace/db";
import { booksTable, studentAccessTable, schoolsTable } from "@workspace/db/schema";
import { z } from "zod";
import type { AuthenticatedRequest } from "../middlewares/auth.js";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// Student login endpoint (public, rate limited by IP in app.ts)
router.post("/login", async (req, res): Promise<void> => {
  const schema = z.object({
    schoolCode: z.string().min(1),
    password: z.string().min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { schoolCode, password } = parsed.data;

  try {
    // Find school by code with active student access
    const result = await db
      .select({
        school: schoolsTable,
        studentAccess: studentAccessTable,
      })
      .from(studentAccessTable)
      .innerJoin(schoolsTable, eq(studentAccessTable.schoolId, schoolsTable.id))
      .where(and(
        eq(schoolsTable.code, schoolCode),
        eq(schoolsTable.isActive, true),
        eq(studentAccessTable.isActive, true)
      ))
      .limit(1);

    if (result.length === 0) {
      logger.warn({ schoolCode }, "Login attempt: school not found or inactive");
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const { school, studentAccess } = result[0];

    // Verify password
    const isValid = await argon2.verify(studentAccess.passwordHash, password);
    if (!isValid) {
      logger.warn({ schoolCode }, "Login attempt: invalid password");
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Generate JWT token (2 hours expiry)
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error("JWT_SECRET environment variable is not set");
      res.status(500).json({ error: "Server configuration error" });
      return;
    }

    const token = jwt.sign(
      { role: "student", schoolId: school.id },
      jwtSecret,
      { expiresIn: "2h" }
    );

    logger.info({ schoolId: school.id }, "Student login successful");
    res.json({ token });
  } catch (error) {
    logger.error({ err: error }, "Student login error");
    res.status(500).json({ error: "Login failed" });
  }
});

// Get books (read-only, filtered by school)
router.get("/library/books", async (req, res): Promise<void> => {
  const schoolId = (req as AuthenticatedRequest).schoolId;
  if (!schoolId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const schema = z.object({
    search: z.string().optional(),
    category: z.string().optional(),
    language: z.string().optional(),
    available: z.string().optional(),
  });

  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

  const { search, category, language, available } = parsed.data;
  const filters = [eq(booksTable.schoolId, schoolId)];

  if (search) {
    const searchCondition = or(
      ilike(booksTable.title, `%${search}%`),
      ilike(booksTable.author, `%${search}%`),
      ilike(booksTable.isbn, `%${search}%`)
    );
    if (searchCondition) filters.push(searchCondition);
  }
  if (category) filters.push(eq(booksTable.category, category));
  if (language) filters.push(eq(booksTable.language, language));
  if (available === "true") filters.push(eq(booksTable.availableCopies, booksTable.copies));

  const rows = await db
    .select({
      id: booksTable.id,
      title: booksTable.title,
      subtitle: booksTable.subtitle,
      author: booksTable.author,
      publisher: booksTable.publisher,
      topic: booksTable.topic,
      isbn: booksTable.isbn,
      barcode: booksTable.barcode,
      category: booksTable.category,
      language: booksTable.language,
      volume: booksTable.volume,
      copies: booksTable.copies,
      availableCopies: booksTable.availableCopies,
      dateAdded: booksTable.dateAdded,
      publicationPlace: booksTable.publicationPlace,
      publicationDate: booksTable.publicationDate,
      generalNumber: booksTable.generalNumber,
      specialNumber: booksTable.specialNumber,
      description: booksTable.description,
      coverImage: booksTable.coverImage,
      shelf: booksTable.shelf,
    })
    .from(booksTable)
    .where(and(...filters))
    .orderBy(booksTable.title);

  res.json(rows);
});

// Get single book by ID (read-only, filtered by school)
router.get("/library/books/:id", async (req, res): Promise<void> => {
  const schoolId = (req as AuthenticatedRequest).schoolId;
  if (!schoolId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const schema = z.object({
    id: z.coerce.number().int().positive(),
  });

  const parsed = schema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid book ID" });
    return;
  }

  const book = await db
    .select({
      id: booksTable.id,
      title: booksTable.title,
      subtitle: booksTable.subtitle,
      author: booksTable.author,
      publisher: booksTable.publisher,
      topic: booksTable.topic,
      isbn: booksTable.isbn,
      barcode: booksTable.barcode,
      category: booksTable.category,
      language: booksTable.language,
      volume: booksTable.volume,
      copies: booksTable.copies,
      availableCopies: booksTable.availableCopies,
      dateAdded: booksTable.dateAdded,
      publicationPlace: booksTable.publicationPlace,
      publicationDate: booksTable.publicationDate,
      generalNumber: booksTable.generalNumber,
      specialNumber: booksTable.specialNumber,
      description: booksTable.description,
      coverImage: booksTable.coverImage,
      shelf: booksTable.shelf,
    })
    .from(booksTable)
    .where(and(eq(booksTable.id, parsed.data.id), eq(booksTable.schoolId, schoolId)))
    .limit(1);

  if (book.length === 0) {
    res.status(404).json({ error: "Book not found" });
    return;
  }

  res.json(book[0]);
});

export default router;
