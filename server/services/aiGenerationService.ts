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
  l4?: VocabStage4Data;
  l5?: VocabStage5Data;
}

import { type VocabStage4Data, type VocabStage5Data } from "../../src/lib/vocabConstants";

export type { VocabStage4Data, VocabStage5Data };

const KIMI_API_URL = "https://api.moonshot.cn/v1/chat/completions";
const KIMI_MODEL = "kimi-k2";

function getApiKey(): string {
  const key = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  if (!key) {
    throw new Error("KIMI_API_KEY 또는 MOONSHOT_API_KEY 환경변수가 설정되지 않았습니다.");
  }
  return key;
}

async function fetchWithTimeoutAndRetry(
  url: string,
  options: RequestInit,
  timeoutMs = 30000,
  maxRetries = 1,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Kimi API 호출 실패 (${response.status}): ${errorText}`);
      }
      return response;
    } catch (error) {
      clearTimeout(timer);
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) continue;
    }
  }
  throw lastError ?? new Error("AI API 호출 실패");
}

function validateFullVocab(item: FullGeneratedVocab, originalWord: string): FullGeneratedVocab {
  const meaning = item.meaning || `${originalWord}의 뜻`;

  let example = item.example;
  if (example && !example.includes(originalWord)) {
    example = `${originalWord}을(를) 사용해요.`;
  }

  const relatedWords = [...item.relatedWords];
  const fillerWords = ["비슷한말", "반대말", "관련있는말", "연관어"];
  while (relatedWords.length < 4) {
    relatedWords.push(fillerWords[relatedWords.length % fillerWords.length]);
  }

  const l4 = item.l4?.answer ? item.l4 : generateL4Data(originalWord);
  const l5 = item.l5?.chunks?.length ? item.l5 : generateL5Data(originalWord, example || "", relatedWords);

  return { word: item.word, meaning, example, relatedWords, l4, l5 };
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

  const response = await fetchWithTimeoutAndRetry(KIMI_API_URL, {
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

  const prompt = `당신은 초등학생 어휘 교육 전문가이자 국어 교사입니다.
아래 어휘 목록에 대해 뜻, 예문, 레벨 3/4/5 게임 재료를 한 번에 생성해 주세요.

[공통 규칙]
- 설명 없이 JSON 배열만 출력하세요.
- 모든 문장은 초등학교 3~5학년이 이해할 수 있는 자연스러운 한국어여야 합니다.
- "word"는 입력 어휘와 정확히 같아야 합니다.
- "meaning"은 핵심 뜻만 담은 쉬운 설명 1문장입니다.
- "example"은 해당 어휘가 실제로 포함된 자연스러운 문장 1개입니다.

[레벨 3 관련어 고르기]
- "relatedWords"에는 good 풀 역할을 하는 관련어 10개를 넣으세요.
- 의미 연상, 사용 맥락, 콜로케이션, 관련 행동이 골고루 섞이게 하세요.
- 어느 4개를 뽑아도 정답으로 인정 가능해야 합니다.
- 2~4자 정도의 짧은 단어/구 중심으로 작성하세요.

[레벨 4 음절 선택]
- "l4.answer"는 문장에 쓰인 활용형 targetWord입니다.
- "l4.options"는 정답 음절 전체 + 교란 음절 2개 이상을 섞은 보기 배열입니다.
- 교란 음절은 정답 음절과 모양 또는 소리가 비슷해야 하며, 정답 음절과 완전히 같으면 안 됩니다.

[레벨 5 어절 조립]
- "l5.chunks"는 [주어부, 부사어, 목적어부(핵심 단어 포함), 서술어]의 4개 어절입니다.
- "l5.targetIndex"는 핵심 단어가 들어간 어절 위치입니다. 가능하면 2를 사용하세요.
- "l5.vocabDistractor"는 같은 조사 형태를 유지한 헷갈리는 오답 어절입니다.
- "l5.hints"는 chunks 4개 역할에 맞는 질문 레이블 4개입니다.
- "l5.fullDistractors"는 교란 어절 2개입니다.

[출력 형식]
[
  {
    "word": "단어",
    "meaning": "쉬운 뜻",
    "example": "예문",
    "relatedWords": ["관련어1", "관련어2", "관련어3", "관련어4", "관련어5", "관련어6", "관련어7", "관련어8", "관련어9", "관련어10"],
    "l4": {
      "answer": "활용형",
      "options": ["정답음절1", "정답음절2", "교란1", "교란2"]
    },
    "l5": {
      "chunks": ["어절1", "어절2", "어절3", "어절4"],
      "targetIndex": 2,
      "vocabDistractor": "오답어절",
      "hints": ["누가?", "언제?", "무엇을?", "어찌했나?"],
      "fullDistractors": ["교란어절1", "교란어절2"]
    }
  }
]

[어휘 목록]
${wordList}`;

  const response = await fetchWithTimeoutAndRetry(KIMI_API_URL, {
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
    return parsed.map((item, idx) => validateFullVocab({
      word: String(item.word ?? words[idx] ?? ""),
      meaning: String(item.meaning ?? ""),
      example: String(item.example ?? ""),
      relatedWords: Array.isArray(item.relatedWords)
        ? item.relatedWords.map(String)
        : [],
      l4: item.l4 && typeof item.l4 === "object"
        ? {
            answer: String(item.l4.answer ?? ""),
            options: Array.isArray(item.l4.options) ? item.l4.options.map(String) : [],
          }
        : undefined,
      l5: item.l5 && typeof item.l5 === "object"
        ? {
            chunks: Array.isArray(item.l5.chunks) ? item.l5.chunks.map(String) : [],
            targetIndex: Number(item.l5.targetIndex ?? 0),
            vocabDistractor: String(item.l5.vocabDistractor ?? ""),
            hints: Array.isArray(item.l5.hints) ? item.l5.hints.map(String) : [],
            fullDistractors: Array.isArray(item.l5.fullDistractors) ? item.l5.fullDistractors.map(String) : [],
          }
        : undefined,
    }, words[idx] ?? String(item.word ?? "")));
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
