import { collections, getCollection, type BookDocument, type BorrowDocument } from "../db/mongo.js";

export type LibrarySyncPayload = { books: Array<Record<string, unknown>>; borrows: Array<Record<string, unknown>>; syncedAt?: string };

export async function syncLibraryToMongo(payload: LibrarySyncPayload & { schoolId: number }): Promise<boolean> {
  const books = await getCollection<BookDocument>(collections.books); const borrows = await getCollection<BorrowDocument>(collections.borrows); const now = payload.syncedAt ? new Date(payload.syncedAt) : new Date();
  for (const raw of payload.books) {
    const id = Number(raw.id); const document = { ...raw, id: Number.isInteger(id) ? id : undefined, schoolId: payload.schoolId, syncedAt: now } as unknown as BookDocument;
    if (document.id) await books.updateOne({ id: document.id, schoolId: payload.schoolId }, { $set: document }, { upsert: true }); else await books.insertOne({ ...document, id: Date.now() } as BookDocument);
  }
  for (const raw of payload.borrows) {
    const id = Number(raw.id); const document = { ...raw, id: Number.isInteger(id) ? id : undefined, schoolId: payload.schoolId, borrowedAt: raw.borrowedAt ? new Date(String(raw.borrowedAt)) : new Date(), returnedAt: raw.returnedAt ? new Date(String(raw.returnedAt)) : null, syncedAt: now } as unknown as BorrowDocument;
    if (document.id) await borrows.updateOne({ id: document.id, schoolId: payload.schoolId }, { $set: document }, { upsert: true }); else await borrows.insertOne({ ...document, id: Date.now() } as BorrowDocument);
  }
  return true;
}

export async function getStudentLibraryFromMongo(schoolId: number) {
  const [books, borrows] = await Promise.all([
    (await getCollection<BookDocument>(collections.books)).find({ schoolId }).sort({ title: 1 }).project({ _id: 0 }).toArray(),
    (await getCollection<BorrowDocument>(collections.borrows)).find({ schoolId }).sort({ borrowedAt: -1 }).project({ _id: 0 }).toArray(),
  ]);
  return { books, borrows };
}
