import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { initializeDatabase } from "./db";
import studentsRouter from "./routes/students";
import learningRecordsRouter from "./routes/learningRecords";
import interventionLogsRouter from "./routes/interventionLogs";
import wordImagesRouter from "./routes/wordImages";
import vocabRouter from "./routes/vocab";
import { ensureBootstrapVocabData, ensureContentVocabData } from "./services/vocabService";

const app = express();
const port = Number(process.env.PORT || 3000);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const indexPath = path.join(distDir, "index.html");

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/students", studentsRouter);
app.use("/api/learning-records", learningRecordsRouter);
app.use("/api/intervention-logs", interventionLogsRouter);
app.use("/api/word-images", wordImagesRouter);
app.use("/api/vocab", vocabRouter);

if (existsSync(distDir)) {
  app.use(express.static(distDir));

  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
      return next();
    }

    res.sendFile(indexPath);
  });
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Internal Server Error";
  console.error(error);
  res.status(500).send(message);
});

await initializeDatabase();
await ensureBootstrapVocabData();
await ensureContentVocabData();

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
