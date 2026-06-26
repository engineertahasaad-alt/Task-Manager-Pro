import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { GroupOwnershipError } from "./lib/groupOwnership";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Note: multer handles multipart/form-data — do NOT use express.json() before multer routes
// express.json() and urlencoded only apply to non-multipart requests
app.use((req, _res, next) => {
  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.includes("multipart/form-data")) {
    express.json()(req, _res, next);
  } else {
    next();
  }
});
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (err instanceof GroupOwnershipError || (err as any)?.statusCode === 403) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  logger.error(err);
  res.status(500).json({ error: "Internal server error" });
});

export default app;
