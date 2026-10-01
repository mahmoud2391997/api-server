import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import schoolRouter from "./school.js";
import chatRouter from "./chat.js";
import schoolRegistrationRouter from "./school-registration.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(schoolRouter);
router.use(chatRouter);
router.use(schoolRegistrationRouter);

export default router;
