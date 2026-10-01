import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, isNull, or, sql, gte, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import { academicYearsTable, attendanceTable, booksTable, bookCopiesTable, borrowsTable, employeesTable, studentsTable, teachersTable } from "@workspace/db/schema";
import { z } from "zod";
import { getStudentLibraryFromMongo, syncLibraryToMongo } from "../lib/mongodb.js";
import type { AuthenticatedRequest } from "../middlewares/auth.js";

const MAX_GRADE = 12;
const ARABIC_GRADES = ["الأول ابتدائي", "الثاني ابتدائي", "الثالث ابتدائي", "الرابع ابتدائي", "الخامس ابتدائي", "السادس ابتدائي", "الأول متوسط", "الثاني متوسط", "الثالث متوسط", "الأول ثانوي", "الثاني ثانوي", "الثالث ثانوي"];

function parseGrade(grade: string | null | undefined): number | null {
  const value = String(grade ?? "").trim();
  const numeric = value.match(/^(?:grade\\s*)?(\\d{1,2})$/i);
  if (numeric) return Math.min(MAX_GRADE, Number(numeric[1])) || null;
  const arabic = ARABIC_GRADES.indexOf(value);
  return arabic >= 0 ? arabic + 1 : null;
}

function promoteClassName(className: string, fromGrade: string): string {
  const current = parseGrade(fromGrade);
  if (!current || current >= MAX_GRADE) return className;
  const next = `Grade ${current + 1}`;
  const section = className.match(/section\\s+.+$/i)?.[0];
  return section ? `${next} - ${section.replace(/^section\\s+/i, "Section ")}` : className;
}

function academicYearForDate(date = new Date()) {
  const startYear = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
  return { startYear, label: `${startYear} / ${startYear + 1}`, startDate: `${startYear}-09-01`, endDate: `${startYear + 1}-06-30` };
}

async function ensureCurrentAcademicYear(now = new Date()): Promise<void> {
  const target = academicYearForDate(now);
  await db.transaction(async (tx) => {
    let [year] = await tx.select().from(academicYearsTable).where(eq(academicYearsTable.label, target.label));
    if (!year) {
      [year] = await tx.insert(academicYearsTable).values({ label: target.label, startDate: target.startDate, endDate: target.endDate, isCurrent: "false" }).returning();
    }
    if (year.isCurrent === "true" && year.promotedAt) return;
    const [previous] = await tx.select().from(academicYearsTable).where(and(eq(academicYearsTable.isCurrent, "true"), sql`${academicYearsTable.id} <> ${year.id}`)).orderBy(desc(academicYearsTable.startDate)).limit(1);
    if (previous) {
      const students = await tx.select().from(studentsTable).where(and(eq(studentsTable.academicYearId, previous.id), eq(studentsTable.status, "active")));
      for (const student of students) {
        const current = parseGrade(student.grade);
        const nextGrade = current && current < MAX_GRADE ? `Grade ${current + 1}` : student.grade;
        const nextClass = current && current < MAX_GRADE ? promoteClassName(student.className, student.grade) : student.className;
        await tx.update(studentsTable).set({ grade: nextGrade, className: nextClass, academicYearId: year.id }).where(eq(studentsTable.id, student.id));
      }
    }
    await tx.update(academicYearsTable).set({ isCurrent: "false" }).where(eq(academicYearsTable.isCurrent, "true"));
    await tx.update(academicYearsTable).set({ isCurrent: "true", promotedAt: new Date() }).where(and(eq(academicYearsTable.id, year.id), isNull(academicYearsTable.promotedAt)));
  });
}
import {
  CreateBookBody,
  CreateBookResponse,
  CreateBorrowBody,
  CreateBorrowResponse,
  CreateStudentBody,
  CreateStudentResponse,
  CreateTeacherBody,
  CreateTeacherResponse,
  DeleteBookParams,
  DeleteStudentParams,
  DeleteTeacherParams,
  GetAcademicYearsResponse,
  GetBooksQueryParams,
  GetBooksResponse,
  GetBorrowsQueryParams,
  GetBorrowsResponse,
  GetDashboardSummaryResponse,
  GetStudentsQueryParams,
  GetStudentsResponse,
  GetTeachersQueryParams,
  GetTeachersResponse,
  MarkBookConditionBody,
  MarkBookConditionParams,
  MarkBookConditionResponse,
  ReturnBorrowBody,
  ReturnBorrowParams,
  ReturnBorrowResponse,
  UpdateBookBody,
  UpdateBookParams,
  UpdateBookResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/library/student-data", async (_req, res): Promise<void> => {
  const data = await getStudentLibraryFromMongo((_req as AuthenticatedRequest).schoolId || 1);
  if (!data) {
    res.status(503).json({ error: "MongoDB is not configured" });
    return;
  }
  res.json(data);
});

router.post("/library/sync", async (req, res): Promise<void> => {
  const payload = req.body as { books?: Array<Record<string, unknown>>; borrows?: Array<Record<string, unknown>> };
  if (!Array.isArray(payload.books) || !Array.isArray(payload.borrows)) {
    res.status(400).json({ error: "books and borrows arrays are required" });
    return;
  }
  const synced = await syncLibraryToMongo({ schoolId: (req as AuthenticatedRequest).schoolId || 1, books: payload.books, borrows: payload.borrows });
  if (!synced) {
    res.status(503).json({ error: "MongoDB is not configured" });
    return;
  }
  res.json({ ok: true });
});

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [students, teachers, books, recent, borrowedBooks, availableBooks] = await Promise.all([
    db.select({ id: studentsTable.id }).from(studentsTable).where(eq(studentsTable.status, "active")),
    db.select({ id: teachersTable.id }).from(teachersTable).where(eq(teachersTable.status, "active")),
    db.select({ id: booksTable.id }).from(booksTable),
    db.select({
      id: studentsTable.id,
      title: studentsTable.fullName,
      timestamp: studentsTable.createdAt,
    }).from(studentsTable).orderBy(desc(studentsTable.createdAt)).limit(4),
    db.select({
      borrowed: sql<number>`COALESCE(SUM(${booksTable.copies} - ${booksTable.availableCopies} - ${booksTable.lostCopies} - ${booksTable.damagedCopies}), 0)`,
    }).from(booksTable),
    db.select({
      available: sql<number>`COALESCE(SUM(${booksTable.availableCopies}), 0)`,
    }).from(booksTable),
  ]);
  const borrowedCount = Math.max(0, Number(borrowedBooks[0]?.borrowed ?? 0));
  const availableCount = Number(availableBooks[0]?.available ?? 0);
  const borrowedRate = books.length > 0
    ? Math.round((borrowedCount / books.length) * 1000) / 10
    : 0;
  res.json(GetDashboardSummaryResponse.parse({
    students: students.length,
    teachers: teachers.length,
    books: books.length,
    availableBooks: availableCount,
    borrowedBooks: borrowedCount,
    attendanceRate: borrowedRate,
    recentActivity: recent.map((item) => ({
      id: item.id,
      type: "student",
      title: `New student record: ${item.title}`,
      timestamp: item.timestamp.toISOString(),
    })),
  }));
});

router.get("/borrows/due-today", async (_req, res): Promise<void> => {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.select({
    id: borrowsTable.id,
    bookId: borrowsTable.bookId,
    bookTitle: booksTable.title,
    studentId: borrowsTable.studentId,
    borrowerName: studentsTable.fullName,
    dueDate: borrowsTable.dueDate,
  }).from(borrowsTable)
    .innerJoin(booksTable, eq(booksTable.id, borrowsTable.bookId))
    .leftJoin(studentsTable, eq(studentsTable.id, borrowsTable.studentId))
    .where(and(eq(borrowsTable.dueDate, today), isNull(borrowsTable.returnedAt)))
    .orderBy(booksTable.title);
  res.json(rows);
});

router.get("/students", async (req, res): Promise<void> => {
  const parsed = GetStudentsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, status } = parsed.data;
  const filters = [];
  if (search) filters.push(ilike(studentsTable.fullName, `%${search}%`));
  if (status) filters.push(eq(studentsTable.status, status));
  const rows = await db.select().from(studentsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(studentsTable.createdAt));
  res.json(GetStudentsResponse.parse(rows));
});

router.post("/students", async (req, res): Promise<void> => {
  const parsed = CreateStudentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [student] = await db.insert(studentsTable).values({
    ...parsed.data,
    enrollmentDate: parsed.data.enrollmentDate.toISOString().slice(0, 10),
  }).returning();
  res.status(201).json(CreateStudentResponse.parse(student));
});

// router.patch("/students/:id", async (req, res): Promise<void> => {
//   const params = UpdateStudentParams.safeParse(req.params);
//   const parsed = UpdateStudentBody.safeParse(req.body);
//   if (!params.success) {
//     res.status(400).json({ error: params.error.message });
//     return;
//   }
//   if (!parsed.success) {
//     res.status(400).json({ error: parsed.error.message });
//     return;
//   }
//   const [student] = await db.update(studentsTable).set({
//     ...parsed.data,
//     enrollmentDate: parsed.data.enrollmentDate.toISOString().slice(0, 10),
//   }).where(eq(studentsTable.id, params.data.id)).returning();
//   if (!student) {
//     res.status(404).json({ error: "Student not found" });
//     return;
//   }
//   res.json(UpdateStudentResponse.parse(student));
// });

router.delete("/students/:id", async (req, res): Promise<void> => {
  const params = DeleteStudentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [student] = await db.delete(studentsTable).where(eq(studentsTable.id, params.data.id)).returning();
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/teachers", async (req, res): Promise<void> => {
  const parsed = GetTeachersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, status } = parsed.data;
  const filters = [];
  if (search) filters.push(ilike(teachersTable.fullName, `%${search}%`));
  if (status) filters.push(eq(teachersTable.status, status));
  const rows = await db.select().from(teachersTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(teachersTable.fullName);
  res.json(GetTeachersResponse.parse(rows));
});

router.post("/teachers", async (req, res): Promise<void> => {
  const parsed = CreateTeacherBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { password, isEmployee, fullName, fullNameArabic, ...rest } = parsed.data;
  const [teacher] = await db.insert(teachersTable).values({
    ...rest,
    fullName: fullName || [rest.name, rest.surname].filter(Boolean).join(" "),
    fullNameArabic: fullNameArabic || [rest.name, rest.surname].filter(Boolean).join(" "),
    password: password ?? "",
    isEmployee: isEmployee ?? true,
    status: rest.status ?? "active",
  }).returning();
  const { password: _omit, ...safe } = teacher;
  void _omit;
  res.status(201).json(CreateTeacherResponse.parse(safe));
});

// router.patch("/teachers/:id", async (req, res): Promise<void> => {
//   const params = UpdateTeacherParams.safeParse(req.params);
//   const parsed = UpdateTeacherBody.safeParse(req.body);
//   if (!params.success) {
//     res.status(400).json({ error: params.error.message });
//     return;
//   }
//   if (!parsed.success) {
//     res.status(400).json({ error: parsed.error.message });
//     return;
//   }
//   const { password, isEmployee, fullName, fullNameArabic, ...rest } = parsed.data;
//   const [teacher] = await db.update(teachersTable).set({
//     ...rest,
//     ...(fullName || rest.name || rest.surname
//       ? { fullName: fullName || [rest.name, rest.surname].filter(Boolean).join(" ") }
//       : {}),
//     ...(fullNameArabic ? { fullNameArabic } : {}),
//     ...(password !== undefined ? { password } : {}),
//     ...(isEmployee !== undefined ? { isEmployee } : {}),
//     status: rest.status ?? "active",
//   }).where(eq(teachersTable.id, params.data.id)).returning();
//   if (!teacher) {
//     res.status(404).json({ error: "Teacher not found" });
//     return;
//   }
//   const { password: _omit, ...safe } = teacher;
//   void _omit;
//   res.json(UpdateTeacherResponse.parse(safe));
// });

router.delete("/teachers/:id", async (req, res): Promise<void> => {
  const params = DeleteTeacherParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [teacher] = await db.delete(teachersTable).where(eq(teachersTable.id, params.data.id)).returning();
  if (!teacher) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }
  res.sendStatus(204);
});

// router.get("/employees", async (req, res): Promise<void> => {
//   const parsed = GetEmployeesQueryParams.safeParse(req.query);
//   if (!parsed.success) {
//     res.status(400).json({ error: parsed.error.message });
//     return;
//   }
//   const { search, status } = parsed.data;
//   const filters = [];
//   if (search) filters.push(or(ilike(employeesTable.fullName, `%${search}%`), ilike(employeesTable.jobTitle, `%${search}%`), ilike(employeesTable.employeeNumber, `%${search}%`)));
//   if (status) filters.push(eq(employeesTable.status, status));
//   const rows = await db.select().from(employeesTable)
//     .where(filters.length ? and(...filters) : undefined)
//     .orderBy(employeesTable.employeeNumber);
//   res.json(GetEmployeesResponse.parse(rows));
// });

// router.post("/employees", async (req, res): Promise<void> => {
//   const parsed = CreateEmployeeBody.safeParse(req.body);
//   if (!parsed.success) {
//     res.status(400).json({ error: parsed.error.message });
//     return;
//   }
//   const [employee] = await db.insert(employeesTable).values({
//     ...parsed.data,
//     status: parsed.data.status ?? "active",
//   }).returning();
//   res.status(201).json(CreateEmployeeResponse.parse(employee));
// });

// router.patch("/employees/:id", async (req, res): Promise<void> => {
//   const params = UpdateEmployeeParams.safeParse(req.params);
//   const parsed = UpdateEmployeeBody.safeParse(req.body);
//   if (!params.success) {
//     res.status(400).json({ error: params.error.message });
//     return;
//   }
//   if (!parsed.success) {
//     res.status(400).json({ error: parsed.error.message });
//     return;
//   }
//   const [employee] = await db.update(employeesTable).set({
//     ...parsed.data,
//     status: parsed.data.status ?? "active",
//   }).where(eq(employeesTable.id, params.data.id)).returning();
//   if (!employee) {
//     res.status(404).json({ error: "Employee not found" });
//     return;
//   }
//   res.json(UpdateEmployeeResponse.parse(employee));
// });

// router.delete("/employees/:id", async (req, res): Promise<void> => {
//   const params = DeleteEmployeeParams.safeParse(req.params);
//   if (!params.success) {
//     res.status(400).json({ error: params.error.message });
//     return;
//   }
//   const [employee] = await db.delete(employeesTable).where(eq(employeesTable.id, params.data.id)).returning();
//   if (!employee) {
//     res.status(404).json({ error: "Employee not found" });
//     return;
//   }
//   res.sendStatus(204);
// });

router.get("/library/books", async (req, res): Promise<void> => {
  const parsed = GetBooksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, category } = parsed.data;
  const filters = [];
  if (search) filters.push(or(ilike(booksTable.title, `%${search}%`), ilike(booksTable.author, `%${search}%`), ilike(booksTable.isbn, `%${search}%`)));
  if (category) filters.push(eq(booksTable.category, category));
  const rows = await db.select().from(booksTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(booksTable.title);
  const books = await Promise.all(rows.map(async (book) => {
    const copies = await db.select({ barcode: bookCopiesTable.barcode, status: bookCopiesTable.status })
      .from(bookCopiesTable)
      .where(eq(bookCopiesTable.bookId, book.id));
    return {
      ...book,
      copyIds: copies.map((copy) => copy.barcode),
      lostCopyIds: copies.filter((copy) => copy.status === "lost").map((copy) => copy.barcode),
      damagedCopyIds: copies.filter((copy) => copy.status === "damaged").map((copy) => copy.barcode),
    };
  }));
  res.json(GetBooksResponse.parse(books));
});

router.post("/library/books", async (req, res): Promise<void> => {
  const parsed = CreateBookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const copies = parsed.data.copies ?? 1;
  const [book] = await db.insert(booksTable).values({
    ...parsed.data,
    category: parsed.data.category ?? "",
    author: parsed.data.author ?? "",
    language: parsed.data.language ?? "Arabic",
    status: parsed.data.status ?? "available",
    dateAdded: parsed.data.dateAdded
      ? new Date(parsed.data.dateAdded).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    copies,
    availableCopies: copies,
  }).returning();
  await db.insert(bookCopiesTable).values(
    Array.from({ length: copies }, (_, index) => ({
      bookId: book.id,
      copyNumber: index + 1,
      barcode: `${book.isbn || `BOOK-${book.id}`}-CO-${String(index + 1).padStart(3, "0")}`,
    })),
  );
  res.status(201).json(CreateBookResponse.parse(book));
});

router.patch("/library/books/:id", async (req, res): Promise<void> => {
  const params = UpdateBookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateBookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db.select().from(booksTable).where(eq(booksTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Book not found" });
    return;
  }
  const lost = existing.lostCopies;
  const damaged = existing.damagedCopies;
  const borrowed = existing.copies - existing.availableCopies - lost - damaged;
  const copies = parsed.data.copies ?? existing.copies;
  const availableCopies = Math.max(0, copies - borrowed - lost - damaged);
  const { dateAdded: incomingDateAdded, ...bookRest } = parsed.data;
  const [book] = await db.update(booksTable).set({
    ...bookRest,
    ...(parsed.data.category !== undefined ? { category: parsed.data.category } : {}),
    ...(incomingDateAdded !== undefined
      ? { dateAdded: new Date(incomingDateAdded).toISOString().slice(0, 10) }
      : {}),
    copies,
    availableCopies,
  }).where(eq(booksTable.id, params.data.id)).returning();
  res.json(UpdateBookResponse.parse(book));
});

router.delete("/library/books/:id", async (req, res): Promise<void> => {
  const params = DeleteBookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [book] = await db.delete(booksTable).where(eq(booksTable.id, params.data.id)).returning();
  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }
  res.sendStatus(204);
});

router.patch("/library/books/:id/condition", async (req, res): Promise<void> => {
  const params = MarkBookConditionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = MarkBookConditionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { action, copyId } = parsed.data;
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(booksTable).where(eq(booksTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Book not found" });
      return;
    }
    const lost = existing.lostCopies;
    const damaged = existing.damagedCopies;
    const available = existing.availableCopies;
    if (copyId) {
      const expectedStatus = action === "lost" ? "available" : action === "damaged" ? "available" : action === "found" ? "lost" : "damaged";
      const nextStatus = action === "lost" ? "lost" : action === "damaged" ? "damaged" : "available";
      let [copy] = await tx.select().from(bookCopiesTable)
        .where(and(eq(bookCopiesTable.bookId, existing.id), eq(bookCopiesTable.barcode, copyId), eq(bookCopiesTable.status, expectedStatus)));
      if (!copy && (action === "found" || action === "fixed")) {
        [copy] = await tx.select().from(bookCopiesTable)
          .where(and(eq(bookCopiesTable.bookId, existing.id), eq(bookCopiesTable.barcode, copyId)));
      }
      if (!copy) {
        res.status(409).json({ error: "The selected copy barcode is not available for this action" });
        return;
      }
      await tx.update(bookCopiesTable).set({ status: nextStatus }).where(eq(bookCopiesTable.id, copy.id));
    }
    let next: { lostCopies: number; damagedCopies: number; availableCopies: number } | null = null;
    if (action === "lost") {
      if (available < 1) res.status(409).json({ error: "No copy is on the shelf to mark as lost" });
      else next = { lostCopies: lost + 1, damagedCopies: damaged, availableCopies: available - 1 };
    } else if (action === "damaged") {
      if (available < 1) res.status(409).json({ error: "No copy is on the shelf to mark as damaged" });
      else next = { lostCopies: lost, damagedCopies: damaged + 1, availableCopies: available - 1 };
    } else if (action === "found") {
      if (lost < 1) res.status(409).json({ error: "There are no lost copies to restore" });
      else next = { lostCopies: lost - 1, damagedCopies: damaged, availableCopies: available + 1 };
    } else if (action === "fixed") {
      if (damaged < 1) res.status(409).json({ error: "There are no damaged copies to restore" });
      else next = { lostCopies: lost, damagedCopies: damaged - 1, availableCopies: available + 1 };
    }
    if (next) {
      const [book] = await tx.update(booksTable).set(next).where(eq(booksTable.id, params.data.id)).returning();
      res.json(MarkBookConditionResponse.parse({ ...book, copyIds: copyId ? [copyId] : undefined }));
    }
  });
});

router.get("/library/borrows", async (req, res): Promise<void> => {
  const parsed = GetBorrowsQueryParams.safeParse(req.query);
  const filters = [];
  if (parsed.success && parsed.data.active) filters.push(isNull(borrowsTable.returnedAt));
  const rows = await db.select({
    id: borrowsTable.id,
    bookId: borrowsTable.bookId,
    studentId: borrowsTable.studentId,
    borrowerType: borrowsTable.borrowerType,
    borrowerId: borrowsTable.borrowerId,
    borrowedAt: borrowsTable.borrowedAt,
    dueDate: borrowsTable.dueDate,
    returnedAt: borrowsTable.returnedAt,
    condition: borrowsTable.condition,
    bookTitle: booksTable.title,
    bookBarcode: booksTable.isbn,
    studentName: studentsTable.fullName,
    teacherName: teachersTable.fullName,
    employeeName: employeesTable.fullName,
  }).from(borrowsTable)
    .innerJoin(booksTable, eq(borrowsTable.bookId, booksTable.id))
    .leftJoin(studentsTable, eq(borrowsTable.studentId, studentsTable.id))
    .leftJoin(teachersTable, and(eq(borrowsTable.borrowerType, "teacher"), eq(borrowsTable.borrowerId, teachersTable.id)))
    .leftJoin(employeesTable, and(eq(borrowsTable.borrowerType, "employee"), eq(borrowsTable.borrowerId, employeesTable.id)))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(borrowsTable.borrowedAt));
  res.json(GetBorrowsResponse.parse(rows.map((row) => ({
    ...row,
    borrowerId: row.borrowerId ?? row.studentId ?? 0,
    borrowerName: row.studentName ?? row.teacherName ?? row.employeeName ?? "Unknown borrower",
  }))));
});

router.post("/library/borrows", async (req, res): Promise<void> => {
  const parsed = CreateBorrowBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [book] = await db.select().from(booksTable).where(eq(booksTable.id, parsed.data.bookId));
  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return;
  }
  if (book.availableCopies <= 0) {
    res.status(409).json({ error: "No copies of this book are currently available" });
    return;
  }
  const [existingBorrow] = await db.select({ id: borrowsTable.id }).from(borrowsTable).where(and(
    eq(borrowsTable.bookId, parsed.data.bookId),
    eq(borrowsTable.borrowerType, parsed.data.borrowerType),
    eq(borrowsTable.borrowerId, parsed.data.borrowerId),
    isNull(borrowsTable.returnedAt),
  ));
  if (existingBorrow) {
    res.status(409).json({ error: "This borrower already has an active loan for this book" });
    return;
  }
  const [borrow] = await db.insert(borrowsTable).values({
    bookId: parsed.data.bookId,
    studentId: parsed.data.borrowerType === "student" ? parsed.data.borrowerId : null,
    borrowerType: parsed.data.borrowerType,
    borrowerId: parsed.data.borrowerId,
    dueDate: parsed.data.dueDate ? parsed.data.dueDate.toISOString().slice(0, 10) : null,
  }).returning();
  await db.update(booksTable).set({ availableCopies: book.availableCopies - 1 }).where(eq(booksTable.id, book.id));
  res.status(201).json(CreateBorrowResponse.parse(borrow));
});

router.patch("/library/borrows/:id/return", async (req, res): Promise<void> => {
  const params = ReturnBorrowParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = ReturnBorrowBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const condition = parsed.data.condition ?? "good";
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(borrowsTable).where(eq(borrowsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Borrow not found" });
      return;
    }
    if (existing.returnedAt) {
      res.status(409).json({ error: "This borrow was already returned" });
      return;
    }
    const returnedAt = new Date();
    const [borrow] = await tx.update(borrowsTable).set({ returnedAt, condition }).where(eq(borrowsTable.id, params.data.id)).returning();
    if (condition === "good") {
      await tx.update(booksTable).set({
        availableCopies: sql`LEAST(${booksTable.copies}, ${booksTable.availableCopies} + 1)`,
      }).where(eq(booksTable.id, existing.bookId));
    } else if (condition === "damaged") {
      await tx.update(booksTable).set({
        damagedCopies: sql`${booksTable.damagedCopies} + 1`,
      }).where(eq(booksTable.id, existing.bookId));
    } else {
      await tx.update(booksTable).set({
        lostCopies: sql`${booksTable.lostCopies} + 1`,
      }).where(eq(booksTable.id, existing.bookId));
    }
    res.json(ReturnBorrowResponse.parse({
      ...borrow,
      borrowerType: existing.borrowerType,
      borrowerId: existing.borrowerId ?? existing.studentId ?? 0,
      bookId: existing.bookId,
    }));
  });
});

const attendanceInput = z.object({
  studentId: z.coerce.number().int().positive(),
  academicYearId: z.coerce.number().int().positive(),
  attendanceDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),
  status: z.enum(["present", "absent", "late", "excused"]),
  note: z.string().trim().max(500).optional(),
});

router.get("/attendance", async (req, res): Promise<void> => {
  const query = z.object({
    academicYearId: z.coerce.number().int().positive(),
    studentId: z.coerce.number().int().positive().optional(),
    from: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),
    to: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),
  }).safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid attendance filters" }); return; }
  const filters = [eq(attendanceTable.academicYearId, query.data.academicYearId)];
  if (query.data.studentId) filters.push(eq(attendanceTable.studentId, query.data.studentId));
  if (query.data.from) filters.push(gte(attendanceTable.attendanceDate, query.data.from));
  if (query.data.to) filters.push(lte(attendanceTable.attendanceDate, query.data.to));
  res.json(await db.select().from(attendanceTable).where(and(...filters)).orderBy(desc(attendanceTable.attendanceDate)));
});

router.post("/attendance", async (req, res): Promise<void> => {
  const parsed = attendanceInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid attendance record" }); return; }
  const [student] = await db.select({ id: studentsTable.id }).from(studentsTable).where(eq(studentsTable.id, parsed.data.studentId));
  if (!student) { res.status(404).json({ error: "Student not found" }); return; }
  const [record] = await db.insert(attendanceTable).values(parsed.data).returning();
  res.status(201).json(record);
});

router.get("/academic-years", async (_req, res): Promise<void> => {
  await ensureCurrentAcademicYear();
  const rows = await db.select().from(academicYearsTable).orderBy(desc(academicYearsTable.startDate));
  res.json(GetAcademicYearsResponse.parse(rows.map((row) => ({
    ...row,
    isCurrent: row.isCurrent === "true",
  }))));
});

export default router;
