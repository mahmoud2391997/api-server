import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface StudentRequest extends Request {
  student?: { schoolId: number; studentId: number };
}

export function studentAuth(req: StudentRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(503).json({ error: "Student authentication is not configured" });
  if (!token) return res.status(401).json({ error: "Student token is required" });
  try {
    const claims = jwt.verify(token, secret) as jwt.JwtPayload;
    if (claims.role !== "student" || !Number.isInteger(claims.schoolId) || !Number.isInteger(claims.studentId)) {
      return res.status(403).json({ error: "Invalid student token" });
    }
    req.student = { schoolId: Number(claims.schoolId), studentId: Number(claims.studentId) };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid student token" });
  }
}
