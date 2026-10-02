import express from "express";
import cors from "cors";
import pinoHttpModule from "pino-http";
import router from "./routes/index.js";
import studentRouter from "./routes/student.js";
import healthRouter from "./routes/health.js";
import { logger } from "./lib/logger.js";
import { apiKeyAuth, desktopApiKeyAuth, studentAuth } from "./middlewares/auth.js";
import { ensureMongoIndexes } from "./db/mongo.js";

const pinoHttp = pinoHttpModule as unknown as (options: Record<string, unknown>) => express.RequestHandler;
const app = express();

void ensureMongoIndexes().catch((error) => logger.error({ err: error }, "MongoDB index initialization failed"));

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

// --- Public routes (no keys) ---
app.use("/api", healthRouter); // GET /api/healthz

// --- Student routes: own JWT auth, no desktop key, no school key ---
app.use("/api/student", (req, res, next) =>
  req.path === "/login" ? next() : studentAuth(req, res, next),
);
app.use("/api/student", studentRouter);

// --- Desktop-only routes: require the server-side app key (env: api_key) ---
const DESKTOP_ONLY = ["/register-school", "/school-info", "/sync", "/admin"];
app.use("/api", (req, res, next) =>
  DESKTOP_ONLY.some((p) => req.path === p || req.path.startsWith(`${p}/`))
    ? desktopApiKeyAuth(req, res, next)
    : next(),
);

// --- Per-school key (X-API-Key) for everything except school registration ---
app.use("/api", (req, res, next) =>
  req.path === "/register-school" ? next() : apiKeyAuth(req, res, next),
);

app.use("/api", router);

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err: error, requestId: req.header("x-request-id") }, "Unhandled API error");
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
});

export default app;
