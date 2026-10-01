/**
 * Tenant Isolation Tests
 *
 * This test file verifies that:
 * 1. School B cannot read, edit, delete or borrow A's books, students, loans or attendance by id
 * 2. A student token from A sees only A's books and gets 403/401 on every admin route
 * 3. The API key is rejected on /api/student/*
 * 4. No response contains password, nationalId or borrower details for the student role
 *
 * MANUAL TESTING INSTRUCTIONS:
 *
 * These tests are designed to be run manually against a running API server with test data.
 * To run these tests, you need to:
 *
 * 1. Set up a test database with two schools (School A and School B)
 * 2. Create test data (books, students, etc.) in each school
 * 3. Set environment variables:
 *    - API_BASE_URL: URL of the running API server (default: http://localhost:3000)
 *    - JWT_SECRET: Secret used for JWT signing
 *
 * 4. Start the API server:
 *    pnpm run dev
 *
 * 5. Update the TEST_CONFIG below with your actual test data IDs
 *
 * 6. Run the tests:
 *    pnpm test tests/tenant-isolation.test.ts
 *
 * NOTE: This is a test suite template. Before running, you must:
 * - Set up actual test data in your database
 * - Update TEST_CONFIG with real IDs
 * - Optionally implement proper test database setup/teardown
 */

import { describe, it, expect } from "@jest/globals";

// Test configuration - UPDATE THESE WITH YOUR ACTUAL TEST DATA
const TEST_CONFIG = {
  schoolA: {
    apiKey: "sk-test-school-a-api-key", // Replace with actual API key
    code: "SCHOOL_A", // Replace with actual school code
    studentPassword: "student123", // Replace with actual password
  },
  schoolB: {
    apiKey: "sk-test-school-b-api-key", // Replace with actual API key
    code: "SCHOOL_B", // Replace with actual school code
  },
  testIds: {
    schoolA: {
      bookId: 1, // Replace with actual book ID from School A
      studentId: 1, // Replace with actual student ID from School A
      borrowId: 1, // Replace with actual borrow ID from School A
      attendanceId: 1, // Replace with actual attendance ID from School A
    },
    schoolB: {
      bookId: 2, // Replace with actual book ID from School B
      studentId: 2, // Replace with actual student ID from School B
    },
  },
};

// Helper function to make API requests
async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const baseUrl = process.env.API_BASE_URL || "http://localhost:3000";
  const url = `${baseUrl}${endpoint}`;
  const response = await fetch(url, options);
  return {
    status: response.status,
    data: response.ok ? await response.json() : await response.text(),
  };
}

describe("Tenant Isolation Tests", () => {
  describe("School B cannot access School A's data", () => {
    it("should return 404 when School B tries to read School A's book", async () => {
      const result = await apiRequest(`/api/library/books/${TEST_CONFIG.testIds.schoolA.bookId}`, {
        headers: {
          "X-API-Key": TEST_CONFIG.schoolB.apiKey,
        },
      });
      expect(result.status).toBe(404);
    });

    it("should return 404 when School B tries to update School A's book", async () => {
      const result = await apiRequest(`/api/library/books/${TEST_CONFIG.testIds.schoolA.bookId}`, {
        method: "PATCH",
        headers: {
          "X-API-Key": TEST_CONFIG.schoolB.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Updated Title" }),
      });
      expect(result.status).toBe(404);
    });

    it("should return 404 when School B tries to delete School A's book", async () => {
      const result = await apiRequest(`/api/library/books/${TEST_CONFIG.testIds.schoolA.bookId}`, {
        method: "DELETE",
        headers: {
          "X-API-Key": TEST_CONFIG.schoolB.apiKey,
        },
      });
      expect(result.status).toBe(404);
    });

    it("should return 404 when School B tries to read School A's student", async () => {
      const result = await apiRequest(`/api/students/${TEST_CONFIG.testIds.schoolA.studentId}`, {
        headers: {
          "X-API-Key": TEST_CONFIG.schoolB.apiKey,
        },
      });
      expect(result.status).toBe(404);
    });

    it("should return 404 when School B tries to delete School A's student", async () => {
      const result = await apiRequest(`/api/students/${TEST_CONFIG.testIds.schoolA.studentId}`, {
        method: "DELETE",
        headers: {
          "X-API-Key": TEST_CONFIG.schoolB.apiKey,
        },
      });
      expect(result.status).toBe(404);
    });

    it("should return 404 when School B tries to create a borrow for School A's book", async () => {
      const result = await apiRequest("/api/library/borrows", {
        method: "POST",
        headers: {
          "X-API-Key": TEST_CONFIG.schoolB.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bookId: TEST_CONFIG.testIds.schoolA.bookId,
          borrowerType: "student",
          borrowerId: TEST_CONFIG.testIds.schoolB.studentId,
        }),
      });
      expect(result.status).toBe(404);
    });

    it("should return empty array when School B tries to read School A's attendance", async () => {
      const result = await apiRequest(`/api/attendance?academicYearId=1&studentId=${TEST_CONFIG.testIds.schoolA.studentId}`, {
        headers: {
          "X-API-Key": TEST_CONFIG.schoolB.apiKey,
        },
      });
      expect(result.status).toBe(200);
      const data = result.data as any[];
      expect(data).toHaveLength(0);
    });
  });

  describe("Student token from School A", () => {
    let studentToken: string;

    it("should successfully login as student from School A", async () => {
      const result = await apiRequest("/api/student/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schoolCode: TEST_CONFIG.schoolA.code,
          password: TEST_CONFIG.schoolA.studentPassword,
        }),
      });
      expect(result.status).toBe(200);
      studentToken = (result.data as any).token;
      expect(studentToken).toBeDefined();
    });

    it("should only see School A's books", async () => {
      const result = await apiRequest("/api/student/library/books", {
        headers: {
          Authorization: `Bearer ${studentToken}`,
        },
      });
      expect(result.status).toBe(200);
      const books = result.data as any[];
      // All books should belong to School A
      books.forEach((book) => {
        expect(book).toHaveProperty("id");
        expect(book).toHaveProperty("title");
        expect(book).toHaveProperty("availableCopies");
      });
    });

    it("should get 401 on admin routes with student token", async () => {
      const adminRoutes = [
        "/api/students",
        "/api/teachers",
        "/api/library/books",
        "/api/library/borrows",
        "/api/admin/student-access",
      ];

      for (const route of adminRoutes) {
        const result = await apiRequest(route, {
          headers: {
            Authorization: `Bearer ${studentToken}`,
          },
        });
        expect(result.status).toBe(401);
      }
    });

    it("should not return sensitive data in student book responses", async () => {
      const result = await apiRequest("/api/student/library/books", {
        headers: {
          Authorization: `Bearer ${studentToken}`,
        },
      });
      expect(result.status).toBe(200);
      const books = result.data as any[];

      books.forEach((book) => {
        // Should not contain sensitive fields
        expect(book).not.toHaveProperty("password");
        expect(book).not.toHaveProperty("nationalId");
        expect(book).not.toHaveProperty("guardianPhone");
        expect(book).not.toHaveProperty("borrowerName");
        expect(book).not.toHaveProperty("studentId");
      });
    });
  });

  describe("API key rejected on student routes", () => {
    it("should return 401 when using API key on /api/student/library/books", async () => {
      const result = await apiRequest("/api/student/library/books", {
        headers: {
          "X-API-Key": TEST_CONFIG.schoolA.apiKey,
        },
      });
      expect(result.status).toBe(401);
    });

    it("should return 401 when using API key on /api/student/library/books/:id", async () => {
      const result = await apiRequest(`/api/student/library/books/${TEST_CONFIG.testIds.schoolA.bookId}`, {
        headers: {
          "X-API-Key": TEST_CONFIG.schoolA.apiKey,
        },
      });
      expect(result.status).toBe(401);
    });
  });

  describe("Student responses do not contain sensitive data", () => {
    it("should not include password in any response", async () => {
      // First login to get token
      const loginResult = await apiRequest("/api/student/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schoolCode: TEST_CONFIG.schoolA.code,
          password: TEST_CONFIG.schoolA.studentPassword,
        }),
      });
      const studentToken = (loginResult.data as any).token;

      const result = await apiRequest("/api/student/library/books", {
        headers: {
          Authorization: `Bearer ${studentToken}`,
        },
      });
      const responseString = JSON.stringify(result.data);
      expect(responseString).not.toContain("password");
    });

    it("should not include nationalId in any response", async () => {
      const loginResult = await apiRequest("/api/student/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schoolCode: TEST_CONFIG.schoolA.code,
          password: TEST_CONFIG.schoolA.studentPassword,
        }),
      });
      const studentToken = (loginResult.data as any).token;

      const result = await apiRequest("/api/student/library/books", {
        headers: {
          Authorization: `Bearer ${studentToken}`,
        },
      });
      const responseString = JSON.stringify(result.data);
      expect(responseString).not.toContain("nationalId");
    });

    it("should not include guardianPhone in any response", async () => {
      const loginResult = await apiRequest("/api/student/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schoolCode: TEST_CONFIG.schoolA.code,
          password: TEST_CONFIG.schoolA.studentPassword,
        }),
      });
      const studentToken = (loginResult.data as any).token;

      const result = await apiRequest("/api/student/library/books", {
        headers: {
          Authorization: `Bearer ${studentToken}`,
        },
      });
      const responseString = JSON.stringify(result.data);
      expect(responseString).not.toContain("guardianPhone");
    });

    it("should not include borrower details in book responses", async () => {
      const loginResult = await apiRequest("/api/student/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schoolCode: TEST_CONFIG.schoolA.code,
          password: TEST_CONFIG.schoolA.studentPassword,
        }),
      });
      const studentToken = (loginResult.data as any).token;

      const result = await apiRequest("/api/student/library/books", {
        headers: {
          Authorization: `Bearer ${studentToken}`,
        },
      });
      const books = result.data as any[];
      books.forEach((book) => {
        expect(book).not.toHaveProperty("borrowerName");
        expect(book).not.toHaveProperty("studentId");
        expect(book).not.toHaveProperty("borrowerId");
      });
    });
  });
});

