import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";

jest.mock("@workspace/db", () => ({ db: {} }));
jest.mock("@workspace/db/schema", () => ({}));

jest.mock("../src/routes/index.js", () => {
  const express = require("express");
  return { __esModule: true, default: express.Router() };
});

jest.mock("../src/routes/student.js", () => {
  const express = require("express");
  const router = express.Router();
  router.post("/login", (_req: unknown, res: { sendStatus: (status: number) => void }) => res.sendStatus(200));
  return { __esModule: true, default: router };
});

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.api_key = "test-desktop-key";
  const { default: app } = await import("../src/app");
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

describe("authentication boundaries", () => {
  it("allows student login to reach its own validation without X-App-API-Key", async () => {
    const response = await fetch(`${baseUrl}/api/student/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(200);
  });

  it("requires X-App-API-Key for desktop sync", async () => {
    const response = await fetch(`${baseUrl}/api/sync/library`);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Desktop API key is required" });
  });
});
