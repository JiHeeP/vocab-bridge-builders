import { pool } from "../db";

export interface ImageFetchRequestWord {
  word: string;
  meaning: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractKeywordCandidates(text: string): string[] {
  return text
    .split(/[,\s/()]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !["하다", "있는", "하는", "것", "말", "뜻", "설명"].includes(token));
}

function buildQueryText({ word, meaning }: ImageFetchRequestWord) {
  const cleanWord = word.trim();
  const meaningTokens = extractKeywordCandidates(meaning?.trim() || "");
  const primaryKeyword = meaningTokens[0] ?? "";

  const keywords = [cleanWord, primaryKeyword, "education", "illustration"]
    .map((token) => token.trim())
    .filter(Boolean);

  return Array.from(new Set(keywords)).join(" ");
}

export async function fetchAndCacheWordImages(words: ImageFetchRequestWord[]) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    throw new Error("UNSPLASH_ACCESS_KEY is not configured");
  }

  const uniqueWords = Array.from(
    new Map(words.map((item) => [item.word, item])).values(),
  );

  if (uniqueWords.length === 0) {
    return { results: [], total: 0, fetched: 0, cached: 0 };
  }

  const existingResult = await pool.query<{ word: string }>(
    "SELECT word FROM word_images WHERE word = ANY($1::text[])",
    [uniqueWords.map(({ word }) => word)],
  );

  const existingWords = new Set(existingResult.rows.map(({ word }) => word));
  const missingWords = uniqueWords.filter(({ word }) => !existingWords.has(word));

  if (missingWords.length === 0) {
    return {
      results: uniqueWords.map(({ word }) => ({ word, status: "already_cached", query: "-" })),
      total: uniqueWords.length,
      fetched: 0,
      cached: uniqueWords.length,
    };
  }

  const results: Array<{ word: string; status: string; query?: string }> = [];

  for (const item of missingWords) {
    const queryText = buildQueryText(item);

    try {
      const searchParams = new URLSearchParams({
        query: queryText,
        per_page: "5",
        orientation: "squarish",
      });
      const response = await fetch(`https://api.unsplash.com/search/photos?${searchParams}`, {
        headers: { Authorization: `Client-ID ${accessKey}` },
      });

      if (!response.ok) {
        results.push({
          word: item.word,
          status: response.status === 429 ? "rate_limited" : "api_error",
          query: queryText,
        });
        if (response.status === 403 || response.status === 429) {
          break;
        }
        continue;
      }

      const data = (await response.json()) as {
        results?: Array<{
          urls: { small: string };
          user: { name: string; links: { html: string } };
          links: { html: string; download_location?: string };
        }>;
      };

      const photo = data.results?.find((candidate) => candidate?.urls?.small) ?? data.results?.[0];
      if (!photo) {
        results.push({ word: item.word, status: "no_results", query: queryText });
        continue;
      }

      if (photo.links.download_location) {
        fetch(`${photo.links.download_location}?client_id=${accessKey}`).catch(() => undefined);
      }

      await pool.query(
        `
          INSERT INTO word_images (word, image_url, photographer_name, photographer_url, unsplash_url)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (word) DO UPDATE
          SET image_url = EXCLUDED.image_url,
              photographer_name = EXCLUDED.photographer_name,
              photographer_url = EXCLUDED.photographer_url,
              unsplash_url = EXCLUDED.unsplash_url
        `,
        [item.word, photo.urls.small, photo.user.name, photo.user.links.html, photo.links.html],
      );

      results.push({ word: item.word, status: "fetched", query: queryText });
      await sleep(300);
    } catch {
      results.push({ word: item.word, status: "error", query: queryText });
    }
  }

    for (const word of existingWords) {
      results.push({ word, status: "already_cached", query: "-" });
    }

  return {
    results,
    total: uniqueWords.length,
    fetched: results.filter(({ status }) => status === "fetched").length,
    cached: existingWords.size,
  };
}
