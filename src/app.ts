import express from "express";
import cors from "cors";
import pinoHttpModule from "pino-http";
import router from "./routes/index.js";
import studentRouter from "./routes/student.js";
import { logger } from "./lib/logger.js";
import { apiKeyAuth, studentAuth } from "./middlewares/auth.js";

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
  allowedHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Registration-Secret"],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Public routes (no auth required)
app.use("/api/healthz", (req, res, next) => next());
app.use("/api/register-school", (req, res, next) => next());

// Student routes
app.use("/api/student/login", (req, res, next) => next());
app.use("/api/student", studentAuth);
app.use("/api/student", studentRouter);

// Admin routes: require API key
app.use("/api/admin", apiKeyAuth);

// All other API routes: require API key
app.use("/api", apiKeyAuth);

app.use("/api", router);

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err: error, requestId: req.header("x-request-id") }, "Unhandled API error");
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
});

export default app;
