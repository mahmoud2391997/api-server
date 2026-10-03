import { Router, type Response } from "express";
import {
  getStudentLibraryFromMongo,
  syncLibraryToMongo,
  type LibrarySyncPayload,
} from "../lib/mongodb.js";
import type { AuthenticatedRequest } from "../middlewares/auth.js";

const router = Router();
const MAX_RECORDS_PER_COLLECTION = 10_000;

function getSchoolId(req: AuthenticatedRequest, res: Response): number | null {
  if (typeof req.schoolId !== "number") {
    res.status(401).json({ error: "School authentication is required" });
    return null;
  }
  return req.schoolId;
}

router.get("/sync/library", async (req: AuthenticatedRequest, res) => {
  const schoolId = getSchoolId(req, res);
  if (schoolId === null) return;

  try {
    const library = await getStudentLibraryFromMongo(schoolId);
    if (!library) {
      return res.status(503).json({ error: "Cloud library storage is not configured" });
    }
    return res.json({ ...library, syncedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: "Unable to retrieve cloud library data" });
  }
});

router.post("/sync/library", async (req: AuthenticatedRequest, res) => {
  const schoolId = getSchoolId(req, res);
  if (schoolId === null) return;

  const { books, borrows, deletedBooks = [], deletedBorrows = [], syncedAt } = req.body ?? {};
  if (
    !Array.isArray(books) ||
    !Array.isArray(borrows) ||
    !Array.isArray(deletedBooks) ||
    !Array.isArray(deletedBorrows) ||
    books.length > MAX_RECORDS_PER_COLLECTION ||
    borrows.length > MAX_RECORDS_PER_COLLECTION ||
    deletedBooks.length > MAX_RECORDS_PER_COLLECTION ||
    deletedBorrows.length > MAX_RECORDS_PER_COLLECTION ||
    books.some((record) => !record || typeof record !== "object" || Array.isArray(record)) ||
    borrows.some((record) => !record || typeof record !== "object" || Array.isArray(record)) ||
    deletedBooks.some((id) => !Number.isInteger(id) || id < 1) ||
    deletedBorrows.some((id) => !Number.isInteger(id) || id < 1)
  ) {
    return res.status(400).json({
      error: "books and borrows must be arrays of objects; deletion ID arrays must contain positive integers within the allowed size",
    });
  }

  const payload: LibrarySyncPayload & { schoolId: number } = {
    schoolId,
    books,
    borrows,
    deletedBooks,
    deletedBorrows,
    ...(typeof syncedAt === "string" ? { syncedAt } : {}),
  };

  try {
    const synced = await syncLibraryToMongo(payload);
    if (!synced) {
      return res.status(503).json({ error: "Cloud library storage is not configured" });
    }
    return res.json({
      success: true,
      strategy: "desktop-wins",
      syncedAt: payload.syncedAt ?? new Date().toISOString(),
      counts: {
        books: books.length,
        borrows: borrows.length,
        deletedBooks: deletedBooks.length,
        deletedBorrows: deletedBorrows.length,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Unable to sync library data" });
  }
});

export default router;
