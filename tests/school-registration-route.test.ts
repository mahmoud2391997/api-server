import express from "express";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockStore: { schools: Array<Record<string, unknown>>; studentAccess: Array<Record<string, unknown>> } = {
  schools: [],
  studentAccess: [],
};

jest.mock("../src/db/mongo.js", () => ({
  collections: { schools: "schools", studentAccess: "student_access" },
  getCollection: jest.fn(async (name: string) => {
    const records = name === "schools" ? mockStore.schools : mockStore.studentAccess;
    return {
      findOne: jest.fn(async (query: Record<string, unknown>) => records.find((record) =>
        Object.entries(query).every(([key, value]) => record[key] === value),
      ) ?? null),
      insertOne: jest.fn(async (record: Record<string, unknown>) => {
        records.push(record);
        return { acknowledged: true };
      }),
      deleteOne: jest.fn(async (query: Record<string, unknown>) => {
        const index = records.findIndex((record) => Object.entries(query).every(([key, value]) => record[key] === value));
        if (index >= 0) records.splice(index, 1);
        return { acknowledged: true, deletedCount: index >= 0 ? 1 : 0 };
      }),
    };
  }),
  nextId: jest.fn(async (name: string) => name === "schools" ? 17 : 41),
}));

jest.mock("argon2", () => ({
  __esModule: true,
  default: { hash: jest.fn(async (password: string) => `test-hash:${password}`) },
}));

import router from "../src/routes/school-registration.js";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.REGISTRATION_SECRET = "test-registration-secret";
  const app = express();
  app.use(express.json());
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
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  delete process.env.REGISTRATION_SECRET;
});

beforeEach(() => {
  mockStore.schools.length = 0;
  mockStore.studentAccess.length = 0;
  jest.clearAllMocks();
});

describe("school registration student portal provisioning", () => {
  it("creates a school-scoped shared student login without returning the password hash", async () => {
    const response = await fetch(`${baseUrl}/api/register-school`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Registration-Secret": "test-registration-secret" },
      body: JSON.stringify({
        name: "Branch One",
        nameArabic: "الفرع الأول",
        code: "BRANCH-01",
        studentAccess: { username: "student_branch-01", password: "PortalPass123" },
      }),
    });

    expect(response.status).toBe(201);
    const result = await response.json() as Record<string, any>;
    expect(result.studentAccess).toEqual({ username: "student_branch-01", configured: true });
    expect(mockStore.schools).toHaveLength(1);
    expect(mockStore.studentAccess).toHaveLength(1);
    expect(mockStore.studentAccess[0]).toMatchObject({
      schoolId: 17,
      mode: "shared",
      username: "student_branch-01",
      passwordHash: "test-hash:PortalPass123",
      isActive: true,
    });
    expect(JSON.stringify(result)).not.toContain("PortalPass123");
    expect(JSON.stringify(result)).not.toContain("test-hash");
  });

  it("rejects weak student passwords before allocating a school", async () => {
    const response = await fetch(`${baseUrl}/api/register-school`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Registration-Secret": "test-registration-secret" },
      body: JSON.stringify({
        name: "Branch Two",
        nameArabic: "الفرع الثاني",
        code: "BRANCH-02",
        studentAccess: { username: "student_branch-02", password: "short" },
      }),
    });

    expect(response.status).toBe(400);
    expect(mockStore.schools).toHaveLength(0);
    expect(mockStore.studentAccess).toHaveLength(0);
  });
});
