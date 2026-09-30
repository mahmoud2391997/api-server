import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import schoolRouter from "./school.js";
import chatRouter from "./chat.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(schoolRouter);
router.use(chatRouter);

export default router;
