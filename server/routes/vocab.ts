import { Router } from "express";
import multer from "multer";
import {
  createVocabSession,
  createVocabWord,
  getAutoFillData,
  getVocabCatalog,
  getVocabSessionWords,
  importVocabSpreadsheet,
  mapWordRow,
  refreshDefinitions,
  updateVocabSession,
} from "../services/vocabService";
import { pool } from "../db";
import { generateVocabDefinitions, generateFullVocabDefinitions, generateL4Data, generateL5Data } from "../services/aiGenerationService";
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

router.get("/auto-fill", async (req, res, next) => {
  try {
    const word = typeof req.query.word === "string" ? req.query.word.trim() : "";
    if (!word) {
      return res.status(400).send("word parameter is required");
    }
    const result = getAutoFillData(word);
    res.json(result ?? { meaning: "", examples: [] });
  } catch (error) {
    next(error);
  }
});

router.post("/refresh-definitions", async (req, res, next) => {
  try {
    const result = await refreshDefinitions();
    res.json(result);
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

    if (!sessionId || !word?.trim()) {
      return res.status(400).send("sessionId and word are required");
    }

    const examplesArr = Array.isArray(examples) ? examples : [];
    const relatedWordsArr = Array.isArray(relatedWords) ? relatedWords : [];

    // Auto-generate l4 if not provided
    const l4Raw = {
      answer: l4?.answer ?? "",
      options: Array.isArray(l4?.options) ? l4.options : [],
    };
    const l4Final = l4Raw.answer ? l4Raw : generateL4Data(word.trim());

    // Auto-generate l5 if not provided
    const l5Raw = {
      chunks: Array.isArray(l5?.chunks) ? l5.chunks : [],
      targetIndex: Number(l5?.targetIndex ?? 0),
      vocabDistractor: l5?.vocabDistractor ?? "",
      hints: Array.isArray(l5?.hints) ? l5.hints : [],
      fullDistractors: Array.isArray(l5?.fullDistractors) ? l5.fullDistractors : [],
    };
    const l5Final = l5Raw.chunks.length > 0
      ? l5Raw
      : generateL5Data(word.trim(), examplesArr[0] || "", relatedWordsArr);

    const created = await createVocabWord({
      sessionId,
      word,
      meaning: meaning?.trim() || "",
      examples: examplesArr,
      relatedWords: relatedWordsArr,
      l4: l4Final,
      l5: l5Final,
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
    const { category, subject = null } = req.body ?? {};
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

    res.json(
      await importVocabSpreadsheet({
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

// AI-powered vocabulary generation (Kimi 2.5)
router.post("/ai-generate", async (req, res, next) => {
  try {
    const { words } = req.body ?? {};
    if (!Array.isArray(words) || words.length === 0) {
      return res.status(400).send("words array is required");
    }

    const cleanWords = words.map((w: unknown) => String(w).trim()).filter(Boolean);
    if (cleanWords.length === 0) {
      return res.status(400).send("at least one non-empty word is required");
    }

    const result = await generateVocabDefinitions(cleanWords);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Bulk word creation: create session + add multiple words at once
// Accepts full vocab data; auto-generates l4/l5 if missing
router.post("/bulk-words", async (req, res, next) => {
  try {
    const { sessionId, words: wordList } = req.body ?? {};

    if (!sessionId) {
      return res.status(400).send("sessionId is required");
    }

    if (!Array.isArray(wordList) || wordList.length === 0) {
      return res.status(400).send("words array is required");
    }

    const results = [];
    for (const item of wordList) {
      const word = item.word?.trim();
      if (!word) continue;

      const examples = Array.isArray(item.examples)
        ? item.examples.filter(Boolean)
        : item.example
          ? [item.example]
          : [];
      const relatedWords = Array.isArray(item.relatedWords)
        ? item.relatedWords.filter(Boolean)
        : [];

      // Auto-generate l4 if not provided
      const l4 = item.l4?.answer
        ? { answer: item.l4.answer, options: Array.isArray(item.l4.options) ? item.l4.options : [] }
        : generateL4Data(word);

      // Auto-generate l5 if not provided
      const l5 = item.l5?.chunks?.length > 0
        ? {
            chunks: item.l5.chunks,
            targetIndex: Number(item.l5.targetIndex ?? 0),
            vocabDistractor: item.l5.vocabDistractor ?? "",
            hints: Array.isArray(item.l5.hints) ? item.l5.hints : [],
            fullDistractors: Array.isArray(item.l5.fullDistractors) ? item.l5.fullDistractors : [],
          }
        : generateL5Data(word, examples[0] || "", relatedWords);

      const created = await createVocabWord({
        sessionId,
        word,
        meaning: item.meaning?.trim() || "",
        examples,
        relatedWords,
        l4,
        l5,
        sourceType: "manual",
      });
      results.push(created);
    }

    res.status(201).json({ insertedCount: results.length, words: results });
  } catch (error) {
    next(error);
  }
});

// AI-powered full vocabulary generation (meaning + example + relatedWords)
router.post("/ai-generate-full", async (req, res, next) => {
  try {
    const { words } = req.body ?? {};
    if (!Array.isArray(words) || words.length === 0) {
      return res.status(400).send("words array is required");
    }

    const cleanWords = words.map((w: unknown) => String(w).trim()).filter(Boolean);
    if (cleanWords.length === 0) {
      return res.status(400).send("at least one non-empty word is required");
    }

    const result = await generateFullVocabDefinitions(cleanWords);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// PUT /words/:wordId - update a word
router.put("/words/:wordId", async (req, res, next) => {
  try {
    const wordId = Number(req.params.wordId);
    if (Number.isNaN(wordId)) return res.status(400).send("valid wordId is required");

    const { word, meaning, examples, relatedWords, l4, l5 } = req.body ?? {};
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (word !== undefined) { updates.push(`word = $${paramIndex++}`); values.push(String(word).trim()); }
    if (meaning !== undefined) { updates.push(`meaning = $${paramIndex++}`); values.push(String(meaning).trim()); }
    if (examples !== undefined) {
      updates.push(`examples = $${paramIndex++}::jsonb`);
      values.push(JSON.stringify(Array.isArray(examples) ? examples.slice(0, 1) : []));
    }
    if (relatedWords !== undefined) {
      updates.push(`related_words = $${paramIndex++}::jsonb`);
      values.push(JSON.stringify(Array.isArray(relatedWords) ? relatedWords : []));
    }
    if (l4 !== undefined) {
      updates.push(`l4 = $${paramIndex++}::jsonb`);
      values.push(JSON.stringify(l4));
    }
    if (l5 !== undefined) {
      updates.push(`l5 = $${paramIndex++}::jsonb`);
      values.push(JSON.stringify(l5));
    }

    if (updates.length === 0) return res.status(400).send("no fields to update");

    values.push(wordId);
    const result = await pool.query(
      `UPDATE vocab_words SET ${updates.join(", ")} WHERE id = $${paramIndex}
       RETURNING id, session_id, word, meaning, examples, related_words, l4, l5, display_order, source_type`,
      values,
    );

    if (!result.rows[0]) return res.status(404).send("word not found");
    res.json(mapWordRow(result.rows[0]));
  } catch (error) { next(error); }
});

// DELETE /words/:wordId
router.delete("/words/:wordId", async (req, res, next) => {
  try {
    const wordId = Number(req.params.wordId);
    if (Number.isNaN(wordId)) return res.status(400).send("valid wordId is required");
    const result = await pool.query("DELETE FROM vocab_words WHERE id = $1 RETURNING id", [wordId]);
    if (!result.rows[0]) return res.status(404).send("word not found");
    res.json({ deleted: true, id: wordId });
  } catch (error) { next(error); }
});

// DELETE /sessions/:sessionId
router.delete("/sessions/:sessionId", async (req, res, next) => {
  try {
    const result = await pool.query(
      "DELETE FROM vocab_sessions WHERE id = $1 RETURNING id",
      [req.params.sessionId],
    );
    if (!result.rows[0]) return res.status(404).send("session not found");
    res.json({ deleted: true, id: req.params.sessionId });
  } catch (error) { next(error); }
});

export default router;
