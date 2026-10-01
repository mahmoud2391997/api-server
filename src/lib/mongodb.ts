import { MongoClient, type Db } from "mongodb";

let clientPromise: Promise<MongoClient> | null = null;

async function getDb(): Promise<Db | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  if (!clientPromise) {
    const client = new MongoClient(uri);
    clientPromise = client.connect();
  }
  const client = await clientPromise;
  return client.db(process.env.MONGODB_DB || "al_bassam_school");
}

export type LibrarySyncPayload = {
  books: Array<Record<string, unknown>>;
  borrows: Array<Record<string, unknown>>;
  syncedAt?: string;
};

export async function syncLibraryToMongo(payload: LibrarySyncPayload & { schoolId: number }): Promise<boolean> {
  const database = await getDb();
  if (!database) return false;
  const syncedAt = payload.syncedAt || new Date().toISOString();
  const books = database.collection("library_books");
  const borrows = database.collection("library_borrows");
  const schoolFilter = { schoolId: payload.schoolId };
  await books.deleteMany(schoolFilter);
  await borrows.deleteMany(schoolFilter);
  if (payload.books.length) await books.insertMany(payload.books.map((book) => ({ ...book, schoolId: payload.schoolId, syncedAt })));
  if (payload.borrows.length) await borrows.insertMany(payload.borrows.map((borrow) => ({ ...borrow, schoolId: payload.schoolId, syncedAt })));
  return true;
}

export async function getStudentLibraryFromMongo(schoolId: number) {
  const database = await getDb();
  if (!database) return null;
  const [books, borrows] = await Promise.all([
    database.collection("library_books").find({ schoolId }).sort({ title: 1 }).toArray(),
    database.collection("library_borrows").find({ schoolId }).sort({ borrowedAt: -1 }).toArray(),
  ]);
  return { books, borrows };
}
