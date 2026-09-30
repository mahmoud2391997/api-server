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

export async function syncLibraryToMongo(payload: LibrarySyncPayload): Promise<boolean> {
  const database = await getDb();
  if (!database) return false;
  const syncedAt = payload.syncedAt || new Date().toISOString();
  const books = database.collection("library_books");
  const borrows = database.collection("library_borrows");
  await books.deleteMany({});
  await borrows.deleteMany({});
  if (payload.books.length) await books.insertMany(payload.books.map((book) => ({ ...book, syncedAt })));
  if (payload.borrows.length) await borrows.insertMany(payload.borrows.map((borrow) => ({ ...borrow, syncedAt })));
  return true;
}

export async function getStudentLibraryFromMongo() {
  const database = await getDb();
  if (!database) return null;
  const [books, borrows] = await Promise.all([
    database.collection("library_books").find({}).sort({ title: 1 }).toArray(),
    database.collection("library_borrows").find({}).sort({ borrowedAt: -1 }).toArray(),
  ]);
  return { books, borrows };
}
