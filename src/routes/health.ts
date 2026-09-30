import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/healthz", (_req: import("express").Request, res: import("express").Response) => {
  res.json({ status: "ok" });
});

export default router;
