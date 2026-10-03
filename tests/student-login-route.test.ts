import express from "express";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockStore: {
  schools: Array<Record<string, unknown>>;
  studentAccess: Array<Record<string, unknown>>;
} = { schools: [], studentAccess: [] };
const mockSign = jest.fn(() => "student-token");

jest.mock("../src/db/mongo.js", () => ({
  collections: { schools: "schools", students: "students", studentAccess: "student_access", books: "books" },
  getCollection: jest.fn(async (name: string) => {
    const records = name === "schools" ? mockStore.schools : mockStore.studentAccess;
    return {
      findOne: jest.fn(async (query: Record<string, unknown>) => records.find((record) =>
        Object.entries(query).every(([key, value]) => {
          if (typeof value === "object" && value !== null && "$ne" in value) return record[key] !== (value as { $ne: unknown }).$ne;
          return record[key] === value;
        }),
      ) ?? null),
    };
  }),
}));

jest.mock("@workspace/db", () => ({
  db: {
    select: jest.fn(() => ({
      from: () => ({ where: () => ({ limit: jest.fn().mockResolvedValue([]) }) }),
    })),
  },
}));

jest.mock("@workspace/db/schema", () => ({
  studentAccessTable: { schoolId: {}, mode: {}, isActive: {} },
}));

jest.mock("drizzle-orm", () => ({
  and: jest.fn((...conditions: unknown[]) => conditions),
  eq: jest.fn((column: unknown, value: unknown) => ({ column, value })),
}));

jest.mock("argon2", () => ({
  __esModule: true,
  default: { verify: jest.fn(async (hash: string, password: string) => hash === `test-hash:${password}`) },
}));

jest.mock("jsonwebtoken", () => ({
  __esModule: true,
  default: { sign: (...args: unknown[]) => mockSign(...args as []) },
}));

import router from "../src/routes/student.js";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.JWT_SECRET = "student-login-test-secret";
  const app = express();
  app.use(express.json());
  app.use("/api/student", router);
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
  delete process.env.JWT_SECRET;
});

beforeEach(() => {
  mockStore.schools.length = 0;
  mockStore.studentAccess.length = 0;
  mockStore.schools.push({ id: 17, code: "BRANCH-01", name: "Branch One", isActive: true });
  mockStore.studentAccess.push({
    id: 41,
    schoolId: 17,
    mode: "shared",
    username: "student_branch-01",
    passwordHash: "test-hash:PortalPass123",
    isActive: true,
  });
  mockSign.mockClear();
});

describe("registered shared student login", () => {
  it("authenticates the issued username and binds the token to its school", async () => {
    const response = await fetch(`${baseUrl}/api/student/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schoolCode: "BRANCH-01", username: "student_branch-01", password: "PortalPass123" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      token: "student-token",
      school: { code: "BRANCH-01" },
      student: { username: "student_branch-01" },
    });
    expect(mockSign).toHaveBeenCalledWith({ role: "student", schoolId: 17 }, "student-login-test-secret", { expiresIn: "2h" });
  });

  it("rejects a different username or another school's code", async () => {
    const wrongUsername = await fetch(`${baseUrl}/api/student/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schoolCode: "BRANCH-01", username: "student_other", password: "PortalPass123" }),
    });
    const wrongSchool = await fetch(`${baseUrl}/api/student/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schoolCode: "BRANCH-02", username: "student_branch-01", password: "PortalPass123" }),
    });

    expect(wrongUsername.status).toBe(401);
    expect(wrongSchool.status).toBe(401);
  });
});
