import { Router, type IRouter } from "express";
import { collections, getCollection, type BookDocument, type BorrowDocument, type StudentDocument, type TeacherDocument } from "../db/mongo.js";
import { z } from "zod";
import type { AuthenticatedRequest } from "../middlewares/auth.js";

const router: IRouter = Router();
const chatBody = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(12).optional(),
});

async function getSchoolContext(schoolId: number) {
  const studentsCollection = await getCollection<StudentDocument>(collections.students);
  const teachersCollection = await getCollection<TeacherDocument>(collections.teachers);
  const booksCollection = await getCollection<BookDocument>(collections.books);
  const borrowsCollection = await getCollection<BorrowDocument>(collections.borrows);
  const [studentsRaw, teachersRaw, booksRaw, loansRaw] = await Promise.all([
    studentsCollection.find({ schoolId }).sort({ createdAt: -1 }).limit(100).project({ _id: 0 }).toArray(),
    teachersCollection.find({ schoolId }).sort({ fullName: 1 }).limit(100).project({ _id: 0 }).toArray(),
    booksCollection.find({ schoolId }).sort({ title: 1 }).limit(200).project({ _id: 0 }).toArray(),
    borrowsCollection.find({ schoolId, returnedAt: null }).sort({ borrowedAt: -1 }).limit(100).project({ _id: 0 }).toArray(),
  ]);
  const booksById = new Map(booksRaw.map((book) => [book.id, book]));
  const studentsById = new Map(studentsRaw.map((student) => [student.id, student]));
  const students = studentsRaw.map(({ id, fullName, status, grade }) => ({ id, name: fullName, status, grade }));
  const teachers = teachersRaw.map(({ id, fullName, status, subject }) => ({ id, name: fullName, status, subject }));
  const books = booksRaw.map(({ id, title, author, category, copies, availableCopies, lostCopies, damagedCopies }) => ({ id, title, author, category, copies, availableCopies, lostCopies, damagedCopies }));
  const activeLoans = loansRaw.map((loan) => ({ bookTitle: booksById.get(loan.bookId)?.title, borrowerName: loan.studentId ? studentsById.get(loan.studentId)?.fullName : undefined, dueDate: loan.dueDate, returnedAt: loan.returnedAt }));
  return { summary: { students: students.length, teachers: teachers.length, books: books.length, availableCopies: books.reduce((sum, book) => sum + Number(book.availableCopies ?? 0), 0), activeLoans: activeLoans.length }, students, teachers, books, activeLoans };
}

router.post("/chat", async (req, res): Promise<void> => {
  const parsed = chatBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Please provide a valid question." }); return; }
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "The school assistant is not configured yet." }); return; }
  try {
    const schoolId = (req as AuthenticatedRequest).schoolId;
    if (!schoolId) { res.status(401).json({ error: "Not authenticated" }); return; }
    const context = await getSchoolContext(schoolId);
    const messages = [
      { role: "system", content: `You are Al-Bassam School's internal assistant. Answer questions about this school system using only the live data below. Be concise, helpful, and clear. Never invent records, passwords, or permissions. If the data does not answer the question, say so. You may answer in Arabic or English based on the user's language.\n\nLIVE SCHOOL DATA:\n${JSON.stringify(context)}` },
      ...(parsed.data.history ?? []).map((item) => ({ role: item.role, content: item.content })),
      { role: "user", content: parsed.data.message },
    ];
    const response = (await fetch("https://api.mistral.ai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: process.env.MISTRAL_MODEL || "mistral-small-latest", messages, temperature: 0.2, max_tokens: 700 }) })) as unknown as {
      ok: boolean;
      json: () => Promise<unknown>;
    };
    if (!response.ok) { res.status(502).json({ error: "Mistral could not answer right now." }); return; }
    const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    res.json({ answer: result.choices?.[0]?.message?.content?.trim() || "I could not find an answer in the school system." });
  } catch (error) {
    req.log?.error?.({ err: error }, "School chatbot failed");
    res.status(500).json({ error: "The school assistant is temporarily unavailable." });
  }
});

export default router;
