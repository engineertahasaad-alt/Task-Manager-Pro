import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db, tasksTable, attachmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const uploadsDir = path.resolve(workspaceRoot, "artifacts/api-server/uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg", "image/png", "image/gif", "image/webp",
      "application/pdf",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("File type not allowed"));
    }
  },
});

const router = Router();

router.post("/tasks/:id/attachments", requireAuth, upload.single("file"), async (req, res): Promise<void> => {
  const taskId = parseInt(req.params.id as string, 10);
  if (isNaN(taskId)) {
    res.status(400).json({ error: "Invalid task ID" });
    return;
  }

  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, taskId));
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const [attachment] = await db
    .insert(attachmentsTable)
    .values({
      taskId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    })
    .returning();

  res.status(201).json({
    id: attachment.id,
    taskId: attachment.taskId,
    filename: attachment.filename,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    url: `/api/uploads/${attachment.filename}`,
    createdAt: attachment.createdAt.toISOString(),
  });
});

// Serve uploaded files
router.get("/uploads/:filename", (req, res): void => {
  const filename = req.params.filename as string;
  const filePath = path.resolve(uploadsDir, filename);

  // Security: ensure path stays within uploadsDir
  if (!filePath.startsWith(uploadsDir)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).json({ error: "File not found" });
    }
  });
});

export default router;
