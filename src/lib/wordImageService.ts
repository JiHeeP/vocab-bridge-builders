import { supabase } from "@/integrations/supabase/client";

export interface WordImage {
  word: string;
  image_url: string;
  photographer_name: string | null;
  photographer_url: string | null;
  unsplash_url: string | null;
}

// Cache in memory
let imageCache: Map<string, WordImage> | null = null;

export async function getWordImages(words: string[]): Promise<Map<string, WordImage>> {
  if (imageCache && words.every(w => imageCache!.has(w))) {
    return imageCache;
  }

  const { data, error } = await supabase
    .from('word_images')
    .select('word, image_url, photographer_name, photographer_url, unsplash_url')
    .in('word', words);

  if (error) {
    console.error('Failed to fetch word images:', error);
    return imageCache || new Map();
  }

  if (!imageCache) imageCache = new Map();
  for (const row of (data || [])) {
    imageCache.set(row.word, row as WordImage);
  }
  return imageCache;
}

export async function fetchAndCacheImages(
  words: { word: string; meaning: string }[],
  onProgress?: (done: number, total: number) => void
): Promise<{ results: { word: string; status: string }[] }> {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(
    `https://${projectId}.supabase.co/functions/v1/fetch-word-images`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({ words }),
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch images: ${res.status}`);
  }

  const result = await res.json();
  // Invalidate cache so next load picks up new images
  imageCache = null;
  return result;
}
