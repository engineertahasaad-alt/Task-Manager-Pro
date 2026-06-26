import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import tasksRouter from "./tasks";
import attachmentsRouter from "./attachments";
import messagesRouter from "./messages";
import notificationsRouter from "./notifications";
import dashboardRouter from "./dashboard";
import reportsRouter from "./reports";
import pushRouter from "./push";
import webauthnRouter from "./webauthn";
import auditRouter from "./audit";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(webauthnRouter);
router.use(pushRouter);
router.use(usersRouter);
router.use(tasksRouter);
router.use(attachmentsRouter);
router.use(messagesRouter);
router.use(notificationsRouter);
router.use(dashboardRouter);
router.use(reportsRouter);
router.use(auditRouter);

export default router;
