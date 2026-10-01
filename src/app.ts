import express from "express";
import cors from "cors";
import pinoHttpModule from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { apiKeyAuth, optionalApiKeyAuth } from "./middlewares/auth.js";
import { studentAuth } from "./middlewares/student-auth.js";

const pinoHttp = pinoHttpModule as unknown as (options: Record<string, unknown>) => express.RequestHandler;
const app = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: { id?: string; method?: string; url?: string }) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: { statusCode?: number }) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const allowedOrigins = new Set(
  [
    ...(process.env.FRONTEND_URL ?? "").split(",").map((origin) => origin.trim()).filter(Boolean),
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ].filter((origin): origin is string => Boolean(origin)),
);

app.use(cors({
  origin(origin, callback) {
    // Desktop Electron requests may not send an Origin header.
    if (!origin || allowedOrigins.has(origin) || process.env.NODE_ENV === "development") {
      callback(null, true);
      return;
    }

    callback(new Error("Origin is not allowed"));
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Registration-Secret"],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply API key authentication to all API routes except health check
app.use("/api", (req, res, next) => {
  if (req.path === "/healthz" || req.path === "/register-school" || req.path === "/student/login") return optionalApiKeyAuth(req, res, next);
  if (req.path.startsWith("/student/")) return studentAuth(req as never, res, next);
  return apiKeyAuth(req, res, next);
});

app.use("/api", router);

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err: error, requestId: req.header("x-request-id") }, "Unhandled API error");
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
});

export default app;
