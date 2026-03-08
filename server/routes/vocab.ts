import { Router } from "express";
import multer from "multer";
import {
  createVocabSession,
  createVocabWord,
  getVocabCatalog,
  getVocabSessionWords,
  importVocabSpreadsheet,
  updateVocabSession,
} from "../services/vocabService";
import { VOCAB_CATEGORIES, VOCAB_SUBJECTS, type VocabCategory, type VocabSubject } from "../../src/lib/vocabConstants";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

function isVocabCategory(value: unknown): value is VocabCategory {
  return typeof value === "string" && VOCAB_CATEGORIES.includes(value as VocabCategory);
}

function isVocabSubject(value: unknown): value is VocabSubject {
  return typeof value === "string" && VOCAB_SUBJECTS.includes(value as VocabSubject);
}

router.get("/catalog", async (req, res, next) => {
  try {
    const includeInactive =
      req.query.includeInactive === "true" || req.query.includeInactive === "1";
    res.json(await getVocabCatalog(includeInactive));
  } catch (error) {
    next(error);
  }
});

router.get("/sessions/:sessionId/words", async (req, res, next) => {
  try {
    res.json(await getVocabSessionWords(req.params.sessionId));
  } catch (error) {
    next(error);
  }
});

router.post("/sessions", async (req, res, next) => {
  try {
    const { category, subject = null, sessionNo, label = null } = req.body ?? {};

    if (!isVocabCategory(category)) {
      return res.status(400).send("valid category is required");
    }

    if (category === "content" && !isVocabSubject(subject)) {
      return res.status(400).send("valid subject is required for content sessions");
    }

    if (category === "tool" && subject) {
      return res.status(400).send("tool sessions cannot include subject");
    }

    const created = await createVocabSession({
      category,
      subject,
      sessionNo: Number(sessionNo),
      label,
    });

    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.patch("/sessions/:sessionId", async (req, res, next) => {
  try {
    if (typeof req.body?.isActive !== "boolean") {
      return res.status(400).send("isActive boolean is required");
    }

    res.json(
      await updateVocabSession(req.params.sessionId, { isActive: req.body.isActive }),
    );
  } catch (error) {
    next(error);
  }
});

router.post("/words", async (req, res, next) => {
  try {
    const {
      sessionId,
      word,
      meaning,
      examples = [],
      relatedWords = [],
      l4,
      l5,
      displayOrder,
    } = req.body ?? {};

    if (!sessionId || !word?.trim() || !meaning?.trim()) {
      return res.status(400).send("sessionId, word, and meaning are required");
    }

    const created = await createVocabWord({
      sessionId,
      word,
      meaning,
      examples: Array.isArray(examples) ? examples : [],
      relatedWords: Array.isArray(relatedWords) ? relatedWords : [],
      l4: {
        answer: l4?.answer ?? "",
        options: Array.isArray(l4?.options) ? l4.options : [],
      },
      l5: {
        chunks: Array.isArray(l5?.chunks) ? l5.chunks : [],
        targetIndex: Number(l5?.targetIndex ?? 0),
        vocabDistractor: l5?.vocabDistractor ?? "",
        hints: Array.isArray(l5?.hints) ? l5.hints : [],
        fullDistractors: Array.isArray(l5?.fullDistractors) ? l5.fullDistractors : [],
      },
      displayOrder: displayOrder === undefined ? undefined : Number(displayOrder),
      sourceType: "manual",
    });

    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.post("/import", upload.single("file"), async (req, res, next) => {
  try {
    const { category, subject = null, sessionId } = req.body ?? {};
    if (!req.file) {
      return res.status(400).send("file is required");
    }

    if (!isVocabCategory(category)) {
      return res.status(400).send("valid category is required");
    }

    if (category === "content" && !isVocabSubject(subject)) {
      return res.status(400).send("valid subject is required for content sessions");
    }

    if (category === "tool" && subject) {
      return res.status(400).send("tool sessions cannot include subject");
    }

    if (!sessionId) {
      return res.status(400).send("sessionId is required");
    }

    res.json(
      await importVocabSpreadsheet({
        sessionId,
        category,
        subject,
        buffer: req.file.buffer,
        originalName: req.file.originalname,
      }),
    );
  } catch (error) {
    next(error);
  }
});

export default router;
