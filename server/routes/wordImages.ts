import { Router } from "express";
import { pool } from "../db";
import { fetchAndCacheWordImages, refetchWordImages } from "../services/wordImageFetcher";

const router = Router();

router.get("/list", async (_req, res, next) => {
  try {
    const result = await pool.query<{ word: string }>(
      "SELECT word FROM word_images ORDER BY word ASC",
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const wordsParam = typeof req.query.words === "string" ? req.query.words : "";
    const words = wordsParam
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean);

    if (words.length === 0) {
      return res.json([]);
    }

    const result = await pool.query(
      `
        SELECT word, image_url, photographer_name, photographer_url, unsplash_url
        FROM word_images
        WHERE word = ANY($1::text[])
      `,
      [words],
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.post("/fetch", async (req, res, next) => {
  try {
    const words = Array.isArray(req.body?.words) ? req.body.words : [];

    if (words.length === 0) {
      return res.status(400).send("words array is required");
    }

    const force = req.body?.force === true;
    const result = force
      ? await refetchWordImages(words)
      : await fetchAndCacheWordImages(words);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
