import { MongoClient, type Collection, type Db, type ClientSession, ObjectId } from "mongodb";

export type MongoDocument = { id: number; [key: string]: unknown };
let clientPromise: Promise<MongoClient> | undefined;

export async function getMongoDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");
  clientPromise ??= new MongoClient(uri).connect();
  const client = await clientPromise;
  return client.db(process.env.MONGODB_DB || "al_bassam_school");
}

export async function getCollection<T extends MongoDocument>(name: string): Promise<Collection<T>> {
  return (await getMongoDb()).collection<T>(name);
}

export async function nextId(name: string, session?: ClientSession): Promise<number> {
  const db = await getMongoDb();
  const result = await db.collection<{ _id: string; value: number }>("counters").findOneAndUpdate(
    { _id: name },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after", session },
  );
  if (!result) throw new Error(`Unable to allocate id for ${name}`);
  return result.value;
}

export function withoutMongoId<T extends { _id?: ObjectId }>(document: T) {
  const { _id: _ignored, ...publicDocument } = document;
  return publicDocument;
}

export async function closeMongo(): Promise<void> {
  if (clientPromise) {
    const client = await clientPromise;
    await client.close();
    clientPromise = undefined;
  }
}

export const collections = {
  schools: "schools",
  academicYears: "academic_years",
  students: "students",
  teachers: "teachers",
  employees: "employees",
  books: "books",
  bookCopies: "book_copies",
  attendance: "attendance",
  borrows: "borrows",
  studentAccess: "student_access",
} as const;

export type SchoolDocument = MongoDocument & { name: string; nameArabic: string; code: string; apiKeyHash: string; isActive: boolean };
export type StudentAccessDocument = MongoDocument & { schoolId: number; passwordHash: string; isActive: boolean; mode: string; studentId?: number | null };
export type BookDocument = MongoDocument & { schoolId: number; title: string; author?: string; isbn?: string; availableCopies: number; copies: number };
export type BorrowDocument = MongoDocument & { schoolId: number; bookId: number; studentId?: number | null; returnedAt?: Date | null; borrowedAt: Date; dueDate?: string | null };
export type StudentDocument = MongoDocument & { schoolId: number; fullName: string; status: string; createdAt: Date; grade?: string };
export type TeacherDocument = MongoDocument & { schoolId: number; fullName: string; status: string };
export type EmployeeDocument = MongoDocument & { schoolId: number; fullName: string; status: string };
export type AcademicYearDocument = MongoDocument & { schoolId: number; label: string; isCurrent: string };

export async function withTransaction<T>(callback: (session: ClientSession) => Promise<T>): Promise<T> {
  if (!clientPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not configured");
    clientPromise = new MongoClient(uri).connect();
  }
  const client = await clientPromise;
  const session = client.startSession();
  try { return await session.withTransaction(() => callback(session)); } finally { await session.endSession(); }
}

export function publicFields<T extends Record<string, unknown>>(doc: T): Omit<T, "_id"> {
  const { _id: _ignored, ...result } = doc;
  return result as Omit<T, "_id">;
}

export async function ensureMongoIndexes(): Promise<void> {
  const db = await getMongoDb();
  await Promise.all([
    db.collection("schools").createIndexes([{ key: { code: 1 }, unique: true }, { key: { name: 1 }, unique: true }, { key: { apiKeyHash: 1 }, unique: true, partialFilterExpression: { apiKeyHash: { $type: "string", $ne: "" } } }]),
    db.collection("academic_years").createIndex({ schoolId: 1, label: 1 }, { unique: true }),
    db.collection("students").createIndexes([{ key: { schoolId: 1, studentNumber: 1 }, unique: true }, { key: { schoolId: 1, createdAt: -1 } }, { key: { schoolId: 1, fullName: 1 } }]),
    db.collection("teachers").createIndex({ schoolId: 1, employeeCode: 1 }, { unique: true }),
    db.collection("employees").createIndex({ schoolId: 1, employeeNumber: 1 }, { unique: true }),
    db.collection("books").createIndexes([{ key: { schoolId: 1, title: 1 } }, { key: { schoolId: 1, isbn: 1 } }, { key: { schoolId: 1, barcode: 1 }, unique: true, partialFilterExpression: { barcode: { $type: "string", $ne: "" } } }]),
    db.collection("book_copies").createIndexes([{ key: { barcode: 1 }, unique: true }, { key: { bookId: 1, copyNumber: 1 }, unique: true }]),
    db.collection("borrows").createIndexes([{ key: { schoolId: 1, returnedAt: 1, dueDate: 1 } }, { key: { schoolId: 1, bookId: 1 } }]),
    db.collection("student_access").createIndex({ schoolId: 1, mode: 1, studentId: 1 }, { unique: true }),
  ]);
}
