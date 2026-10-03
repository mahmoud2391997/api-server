import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import schoolRouter from "./school.js";
import chatRouter from "./chat.js";
import schoolRegistrationRouter from "./school-registration.js";
import librarySyncRouter from "./library-sync.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(schoolRouter);
router.use(chatRouter);
router.use(schoolRegistrationRouter);
router.use(librarySyncRouter);

export default router;
