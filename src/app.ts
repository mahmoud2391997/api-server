import express from "express";
import cors from "cors";
import pinoHttpModule from "pino-http";
import router from "./routes/index.js";
import studentRouter from "./routes/student.js";
import { logger } from "./lib/logger.js";
import { apiKeyAuth, desktopApiKeyAuth, studentAuth } from "./middlewares/auth.js";

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
const corsOptions = {
  origin: true,          // allow any origin (reflects the caller's origin)
  credentials: false,    // no cookies are used, so this must stay off
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-App-API-Key", "X-API-Key", "X-Registration-Secret"],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Public routes do not require authentication.
app.use("/api/healthz", (req, res, next) => next());

// Student login is public; all other student routes use JWT authentication only.
app.use("/api/student", (req, res, next) => {
  if (req.path === "/login") return next();
  return studentAuth(req, res, next);
}, studentRouter);

// Desktop-only routes use the server-side application key. Both sync route
// variants are mounted in this project and must remain protected.
app.use(["/api/register-school", "/api/school-info", "/api/sync", "/api/library/sync"], desktopApiKeyAuth);

// The admin route and remaining API routes use the school-specific API key.
// Desktop-only routes are intentionally excluded because they authenticate via
// their own route-specific mechanism above.
app.use("/api", (req, res, next) => {
  if (
    req.path === "/register-school" ||
    req.path === "/school-info" ||
    req.path === "/sync" ||
    req.path === "/library/sync" ||
    req.path.startsWith("/student")
  ) {
    return next();
  }
  return apiKeyAuth(req, res, next);
});

app.use("/api", router);

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err: error, requestId: req.header("x-request-id") }, "Unhandled API error");
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
});

export default app;
