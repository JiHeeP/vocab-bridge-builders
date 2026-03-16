/**
 * AI generation service using Kimi 2.5 (Moonshot AI)
 * Generates meanings, example sentences, and related words for Korean vocabulary
 * at elementary school 2nd grade level.
 * Also provides algorithmic generation of l4 (syllable block) and l5 (sentence assembly) data.
 */

interface GeneratedVocab {
  word: string;
  meaning: string;
  example: string;
}

export interface FullGeneratedVocab {
  word: string;
  meaning: string;
  example: string;
  relatedWords: string[];
}

export interface VocabStage4Data {
  answer: string;
  options: string[];
}

export interface VocabStage5Data {
  chunks: string[];
  targetIndex: number;
  vocabDistractor: string;
  hints: string[];
  fullDistractors: string[];
}

const KIMI_API_URL = "https://api.moonshot.cn/v1/chat/completions";
const KIMI_MODEL = "kimi-k2";

function getApiKey(): string {
  const key = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  if (!key) {
    throw new Error("KIMI_API_KEY 또는 MOONSHOT_API_KEY 환경변수가 설정되지 않았습니다.");
  }
  return key;
}

export async function generateVocabDefinitions(words: string[]): Promise<GeneratedVocab[]> {
  if (words.length === 0) return [];

  const apiKey = getApiKey();
  const wordList = words.map((w, i) => `${i + 1}. ${w}`).join("\n");

  const prompt = `당신은 초등학교 2학년 학생을 위한 한국어 어휘 학습 도우미입니다.
아래 어휘들의 뜻과 예문을 초등학교 2학년 수준으로 쉽게 만들어주세요.

규칙:
- 뜻: 초등학교 2학년이 이해할 수 있는 쉬운 말로 설명 (1~2문장)
- 예문: 초등학교 2학년이 일상에서 쓸 수 있는 자연스러운 문장 1개
- 반드시 JSON 배열로 응답하세요. 다른 텍스트 없이 JSON만 출력하세요.

어휘 목록:
${wordList}

응답 형식 (JSON 배열만 출력):
[{"word":"어휘1","meaning":"쉬운 뜻","example":"예문"},{"word":"어휘2","meaning":"쉬운 뜻","example":"예문"}]`;

  const response = await fetch(KIMI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: KIMI_MODEL,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kimi API 호출 실패 (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Kimi API에서 빈 응답을 받았습니다.");
  }

  // Extract JSON from potential markdown code blocks
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr) as GeneratedVocab[];
    if (!Array.isArray(parsed)) {
      throw new Error("응답이 배열이 아닙니다.");
    }
    return parsed.map((item) => ({
      word: String(item.word ?? ""),
      meaning: String(item.meaning ?? ""),
      example: String(item.example ?? ""),
    }));
  } catch (parseError) {
    throw new Error(`AI 응답 파싱 실패: ${parseError instanceof Error ? parseError.message : String(parseError)}\n원본: ${content.slice(0, 500)}`);
  }
}

/**
 * Generate full vocabulary data including related words using AI.
 */
export async function generateFullVocabDefinitions(words: string[]): Promise<FullGeneratedVocab[]> {
  if (words.length === 0) return [];

  const apiKey = getApiKey();
  const wordList = words.map((w, i) => `${i + 1}. ${w}`).join("\n");

  const prompt = `당신은 초등학교 2학년 학생을 위한 한국어 어휘 학습 도우미입니다.
아래 어휘들의 뜻, 예문, 관련어를 만들어주세요.

규칙:
- 뜻: 초등학교 2학년이 이해할 수 있는 쉬운 말로 설명 (1~2문장)
- 예문: 초등학교 2학년이 일상에서 쓸 수 있는 자연스러운 문장 1개. 반드시 해당 어휘가 문장에 포함되어야 합니다.
- 관련어: 의미적으로 관련된 어휘 4~6개 (초등학교 수준)
- 반드시 JSON 배열로 응답하세요. 다른 텍스트 없이 JSON만 출력하세요.

어휘 목록:
${wordList}

응답 형식 (JSON 배열만 출력):
[{"word":"어휘","meaning":"쉬운 뜻","example":"예문","relatedWords":["관련어1","관련어2","관련어3","관련어4"]}]`;

  const response = await fetch(KIMI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: KIMI_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kimi API 호출 실패 (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Kimi API에서 빈 응답을 받았습니다.");
  }

  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr) as FullGeneratedVocab[];
    if (!Array.isArray(parsed)) {
      throw new Error("응답이 배열이 아닙니다.");
    }
    return parsed.map((item) => ({
      word: String(item.word ?? ""),
      meaning: String(item.meaning ?? ""),
      example: String(item.example ?? ""),
      relatedWords: Array.isArray(item.relatedWords)
        ? item.relatedWords.map(String)
        : [],
    }));
  } catch (parseError) {
    throw new Error(`AI 응답 파싱 실패: ${parseError instanceof Error ? parseError.message : String(parseError)}\n원본: ${content.slice(0, 500)}`);
  }
}

// --- Algorithmic L4/L5 generation ---

// Common Korean syllables for distractors
const DISTRACTOR_SYLLABLES = [
  "가", "나", "다", "라", "마", "바", "사", "아", "자", "차", "카", "타", "파", "하",
  "고", "노", "도", "로", "모", "보", "소", "오", "조", "초", "코", "토", "포", "호",
  "구", "누", "두", "루", "무", "부", "수", "우", "주", "추", "쿠", "투", "푸", "후",
  "기", "니", "디", "리", "미", "비", "시", "이", "지", "치", "키", "티", "피", "히",
  "국", "문", "학", "과", "리", "사", "회", "음", "술", "체", "육", "별", "달", "꽃",
  "물", "불", "빛", "길", "힘", "말", "글", "손", "발", "눈", "귀", "입", "밤", "낮",
];

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generate L4 (syllable block) data algorithmically from a word.
 */
export function generateL4Data(word: string): VocabStage4Data {
  const syllables = word.split("");
  const usedSet = new Set(syllables);

  const distractorCount = Math.max(3, syllables.length);
  const distractors = shuffleArray(
    DISTRACTOR_SYLLABLES.filter((s) => !usedSet.has(s)),
  ).slice(0, distractorCount);

  return {
    answer: word,
    options: shuffleArray([...syllables, ...distractors]),
  };
}

// Korean sentence role hints
const HINT_LABELS = ["누가?", "언제?", "어디서?", "무엇을?", "어떻게?", "왜?", "무엇이?"];

/**
 * Generate L5 (sentence assembly) data algorithmically from an example sentence.
 */
export function generateL5Data(
  word: string,
  example: string,
  relatedWords: string[],
): VocabStage5Data {
  const empty: VocabStage5Data = {
    chunks: [],
    targetIndex: 0,
    vocabDistractor: "",
    hints: [],
    fullDistractors: [],
  };

  if (!example) return empty;

  // Split the sentence by spaces
  const tokens = example.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return empty;

  // Group tokens into ~4 chunks
  const targetChunkCount = Math.min(5, Math.max(3, Math.ceil(tokens.length / 1.5)));
  const chunkSize = Math.max(1, Math.ceil(tokens.length / targetChunkCount));
  const chunks: string[] = [];
  for (let i = 0; i < tokens.length; i += chunkSize) {
    chunks.push(tokens.slice(i, i + chunkSize).join(" "));
  }

  // Find chunk containing the target word
  let targetIndex = chunks.findIndex((c) => c.includes(word));
  if (targetIndex === -1) targetIndex = 0;

  // Generate vocabDistractor: replace the word in target chunk with a related word
  const targetChunk = chunks[targetIndex];
  let vocabDistractor = "";
  if (relatedWords.length > 0) {
    const replacement = relatedWords[Math.floor(Math.random() * relatedWords.length)];
    vocabDistractor = targetChunk.replace(word, replacement);
    // If replacement didn't change anything, just use the related word with similar particle
    if (vocabDistractor === targetChunk) {
      vocabDistractor = replacement + targetChunk.slice(word.length);
    }
  } else {
    // Fallback: modify the chunk slightly
    vocabDistractor = targetChunk.replace(word, word.split("").reverse().join(""));
  }

  // Generate hints
  const hints = chunks.map((_, i) => HINT_LABELS[i % HINT_LABELS.length]);

  // Generate fullDistractors (1-2 extra chunks that don't belong)
  const fullDistractors: string[] = [];
  if (chunks.length >= 3) {
    // Create a distractor by modifying a non-target chunk
    const otherIdx = (targetIndex + 1) % chunks.length;
    const otherChunk = chunks[otherIdx];
    // Slightly modify it
    if (otherChunk.endsWith(".") || otherChunk.endsWith("요.")) {
      fullDistractors.push(otherChunk.replace(/\.$/, "습니다."));
    } else {
      fullDistractors.push(otherChunk + "도");
    }
  }
  if (relatedWords.length > 1 && chunks.length >= 3) {
    const rw = relatedWords[1] || relatedWords[0];
    // Extract particle from target chunk if possible
    const afterWord = targetChunk.slice(targetChunk.indexOf(word) + word.length);
    fullDistractors.push(rw + afterWord);
  }

  return { chunks, targetIndex, vocabDistractor, hints, fullDistractors };
}
