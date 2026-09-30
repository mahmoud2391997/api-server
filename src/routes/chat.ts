import { Router, type IRouter } from "express";
import { desc, eq, isNull, sql } from "drizzle-orm";
import { db, booksTable, borrowsTable, studentsTable, teachersTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();
const chatBody = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(12).optional(),
});

async function getSchoolContext() {
  const [students, teachers, books, loans, counts] = await Promise.all([
    db.select({ id: studentsTable.id, name: studentsTable.fullName, status: studentsTable.status, grade: studentsTable.grade }).from(studentsTable).orderBy(desc(studentsTable.createdAt)).limit(100),
    db.select({ id: teachersTable.id, name: teachersTable.fullName, status: teachersTable.status, subject: teachersTable.subject }).from(teachersTable).orderBy(teachersTable.fullName).limit(100),
    db.select({ id: booksTable.id, title: booksTable.title, author: booksTable.author, category: booksTable.category, copies: booksTable.copies, availableCopies: booksTable.availableCopies, lostCopies: booksTable.lostCopies, damagedCopies: booksTable.damagedCopies }).from(booksTable).orderBy(booksTable.title).limit(200),
    db.select({ bookTitle: booksTable.title, borrowerName: studentsTable.fullName, dueDate: borrowsTable.dueDate, returnedAt: borrowsTable.returnedAt }).from(borrowsTable).innerJoin(booksTable, eq(borrowsTable.bookId, booksTable.id)).leftJoin(studentsTable, eq(borrowsTable.studentId, studentsTable.id)).where(isNull(borrowsTable.returnedAt)).orderBy(desc(borrowsTable.borrowedAt)).limit(100),
    db.select({ students: sql<number>`count(*)` }).from(studentsTable),
  ]);
  return { summary: { students: Number(counts[0]?.students ?? 0), teachers: teachers.length, books: books.length, availableCopies: books.reduce((sum: number, book) => sum + Number(book.availableCopies ?? 0), 0), activeLoans: loans.length }, students, teachers, books, activeLoans: loans };
}

router.post("/chat", async (req, res): Promise<void> => {
  const parsed = chatBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Please provide a valid question." }); return; }
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "The school assistant is not configured yet." }); return; }
  try {
    const context = await getSchoolContext();
    const messages = [
      { role: "system", content: `You are Al-Bassam School's internal assistant. Answer questions about this school system using only the live data below. Be concise, helpful, and clear. Never invent records, passwords, or permissions. If the data does not answer the question, say so. You may answer in Arabic or English based on the user's language.\n\nLIVE SCHOOL DATA:\n${JSON.stringify(context)}` },
      ...(parsed.data.history ?? []).map((item) => ({ role: item.role, content: item.content })),
      { role: "user", content: parsed.data.message },
    ];
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: process.env.MISTRAL_MODEL || "mistral-small-latest", messages, temperature: 0.2, max_tokens: 700 }) });
    if (!response.ok) { res.status(502).json({ error: "Mistral could not answer right now." }); return; }
    const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    res.json({ answer: result.choices?.[0]?.message?.content?.trim() || "I could not find an answer in the school system." });
  } catch (error) {
    req.log?.error?.({ err: error }, "School chatbot failed");
    res.status(500).json({ error: "The school assistant is temporarily unavailable." });
  }
});

export default router;
