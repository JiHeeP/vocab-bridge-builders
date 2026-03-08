import { api } from "@/lib/api";

export interface WordImage {
  word: string;
  image_url: string;
  photographer_name: string | null;
  photographer_url: string | null;
  unsplash_url: string | null;
}

let imageCache: Map<string, WordImage> | null = null;

export async function getWordImages(words: string[]): Promise<Map<string, WordImage>> {
  if (imageCache && words.every((word) => imageCache!.has(word))) {
    return imageCache;
  }

  const params = new URLSearchParams({ words: words.join(",") });
  const rows = await api<WordImage[]>(`/api/word-images?${params}`);

  if (!imageCache) imageCache = new Map();
  for (const row of rows) {
    imageCache.set(row.word, row);
  }

  return imageCache;
}

export async function getWordImageWordList(): Promise<string[]> {
  const rows = await api<Array<{ word: string }>>("/api/word-images/list");
  return rows.map(({ word }) => word);
}

export async function fetchAndCacheImages(
  words: { word: string; meaning: string }[],
  _onProgress?: (done: number, total: number) => void,
): Promise<{ results: { word: string; status: string }[] }> {
  const result = await api<{ results: { word: string; status: string }[] }>("/api/word-images/fetch", {
    method: "POST",
    body: JSON.stringify({ words }),
  });

  imageCache = null;
  return result;
}
