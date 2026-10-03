import express, { type Request } from "express";
import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from "@jest/globals";

jest.mock("../src/lib/mongodb.js", () => ({
  getStudentLibraryFromMongo: jest.fn(),
  syncLibraryToMongo: jest.fn(),
}));
jest.mock("../src/routes/health.js", () => ({ __esModule: true, default: express.Router() }));
jest.mock("../src/routes/school.js", () => ({ __esModule: true, default: express.Router() }));
jest.mock("../src/routes/chat.js", () => ({ __esModule: true, default: express.Router() }));
jest.mock("../src/routes/school-registration.js", () => ({ __esModule: true, default: express.Router() }));

import { getStudentLibraryFromMongo, syncLibraryToMongo } from "../src/lib/mongodb.js";
import router from "../src/routes/index.js";

const mockGetStudentLibrary = jest.mocked(getStudentLibraryFromMongo);
const mockSyncLibrary = jest.mocked(syncLibraryToMongo);
let server: Server;
let baseUrl: string;

afterEach(() => {
  jest.clearAllMocks();
});

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res, next) => {
    (req as Request & { schoolId?: number }).schoolId = 41;
    next();
  });
  app.use("/api", router);
  await new Promise<void>((resolve) => {
    server = createServer(app).listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server did not start");
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

describe("desktop library sync route contract", () => {
  it("mounts GET /api/sync/library and returns the student-visible snapshot", async () => {
    mockGetStudentLibrary.mockResolvedValueOnce({ books: [{ id: 7, title: "Science" }], borrows: [] } as never);
    const response = await fetch(`${baseUrl}/api/sync/library`);

    expect(response.status).toBe(200);
    const body = await response.json() as { books: Array<{ id: number }>; borrows: unknown[]; syncedAt: string };
    expect(body.books).toEqual([{ id: 7, title: "Science" }]);
    expect(body.borrows).toEqual([]);
    expect(Date.parse(body.syncedAt)).not.toBeNaN();
    expect(mockGetStudentLibrary).toHaveBeenCalledWith(41);
  });

  it("accepts the desktop payload and returns the acknowledgement Electron expects", async () => {
    mockSyncLibrary.mockResolvedValueOnce(true);
    const payload = {
      books: [{ id: 7, title: "Science" }],
      borrows: [],
      deletedBooks: [8],
      deletedBorrows: [12],
      syncedAt: "2026-10-03T00:00:00.000Z",
    };
    const response = await fetch(`${baseUrl}/api/sync/library`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      strategy: "desktop-wins",
      syncedAt: payload.syncedAt,
      counts: { books: 1, borrows: 0 },
    });
    expect(mockSyncLibrary).toHaveBeenCalledWith({ ...payload, schoolId: 41 });
  });

  it("rejects malformed sync snapshots before writing", async () => {
    const response = await fetch(`${baseUrl}/api/sync/library`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ books: [], borrows: [null] }),
    });

    expect(response.status).toBe(400);
    expect(mockSyncLibrary).not.toHaveBeenCalled();
  });

  it("rejects invalid tombstone IDs before writing", async () => {
    const response = await fetch(`${baseUrl}/api/sync/library`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ books: [], borrows: [], deletedBooks: [0] }),
    });

    expect(response.status).toBe(400);
    expect(mockSyncLibrary).not.toHaveBeenCalled();
  });
});
