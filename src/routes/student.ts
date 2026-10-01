import { Router } from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { schoolsTable, studentsTable, studentAccountsTable, booksTable, borrowsTable, attendanceTable } from "@workspace/db/schema";
import { studentAuth, type StudentRequest } from "../middlewares/student-auth.js";

const router = Router();
const loginLimiter = new Map<string, { count: number; reset: number }>();
function hashPassword(password: string) { return crypto.scryptSync(password, process.env.JWT_SECRET || "student-auth", 32).toString("hex"); }
function limited(key: string) { const now = Date.now(); const item = loginLimiter.get(key); if (!item || item.reset < now) { loginLimiter.set(key, { count: 1, reset: now + 900000 }); return false; } item.count += 1; return item.count > 10; }

router.post("/student/login", async (req, res) => {
  const { schoolCode, studentNumber, password } = req.body ?? {};
  if (typeof schoolCode !== "string" || typeof studentNumber !== "string" || typeof password !== "string") return res.status(400).json({ error: "Invalid credentials" });
  if (limited(`${req.ip}:${schoolCode}:${studentNumber}`)) return res.status(429).json({ error: "Too many attempts" });
  const [row] = await db.select({ account: studentAccountsTable, student: studentsTable, school: schoolsTable }).from(studentAccountsTable).innerJoin(studentsTable, eq(studentsTable.id, studentAccountsTable.studentId)).innerJoin(schoolsTable, eq(schoolsTable.id, studentAccountsTable.schoolId)).where(and(eq(schoolsTable.code, schoolCode), eq(studentAccountsTable.username, studentNumber), eq(studentAccountsTable.isActive, true))).limit(1);
  if (!row || !crypto.timingSafeEqual(Buffer.from(hashPassword(password)), Buffer.from(row.account.passwordHash))) return res.status(401).json({ error: "Invalid credentials" });
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(503).json({ error: "Student authentication is not configured" });
  await db.update(studentAccountsTable).set({ lastLoginAt: new Date() }).where(eq(studentAccountsTable.id, row.account.id));
  return res.json({ token: jwt.sign({ role: "student", schoolId: row.school.id, studentId: row.student.id }, secret, { expiresIn: "2h" }), mustChangePassword: row.account.mustChangePassword });
});

router.use(studentAuth);
router.get("/student/me", async (req: StudentRequest, res) => {
  const [row] = await db.select({ id: studentsTable.id, name: studentsTable.fullName, grade: studentsTable.grade, className: studentsTable.className, schoolName: schoolsTable.name, schoolNameArabic: schoolsTable.nameArabic }).from(studentsTable).innerJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId)).where(and(eq(studentsTable.id, req.student!.studentId), eq(studentsTable.schoolId, req.student!.schoolId))).limit(1);
  if (!row) return res.status(404).json({ error: "Student not found" });
  return res.json(row);
});
router.get("/student/library/books", async (req: StudentRequest, res) => {
  const { search, category, language } = req.query;
  const filters = [eq(booksTable.schoolId, req.student!.schoolId)];
  if (typeof category === "string") filters.push(eq(booksTable.category, category));
  if (typeof language === "string") filters.push(eq(booksTable.language, language));
  const rows = await db.select({ id: booksTable.id, title: booksTable.title, author: booksTable.author, category: booksTable.category, language: booksTable.language, availableCopies: booksTable.availableCopies }).from(booksTable).where(and(...filters));
  return res.json(typeof search === "string" ? rows.filter((book) => book.title.toLowerCase().includes(search.toLowerCase())) : rows);
});
router.get("/student/borrows", async (req: StudentRequest, res) => { return res.json(await db.select({ id: borrowsTable.id, bookId: borrowsTable.bookId, dueDate: borrowsTable.dueDate, borrowedAt: borrowsTable.borrowedAt, returnedAt: borrowsTable.returnedAt, condition: borrowsTable.condition }).from(borrowsTable).where(and(eq(borrowsTable.schoolId, req.student!.schoolId), eq(borrowsTable.studentId, req.student!.studentId)))); });
router.get("/student/attendance", async (req: StudentRequest, res) => { return res.json(await db.select({ id: attendanceTable.id, attendanceDate: attendanceTable.attendanceDate, status: attendanceTable.status, note: attendanceTable.note }).from(attendanceTable).where(and(eq(attendanceTable.schoolId, req.student!.schoolId), eq(attendanceTable.studentId, req.student!.studentId)))); });
export default router;
