import { api } from "@/lib/api";
import {
  VOCAB_CATEGORY_LABELS,
  VOCAB_SUBJECTS,
  type VocabCategory,
  type VocabSubject,
} from "@/lib/vocabConstants";

export type { VocabCategory, VocabSubject } from "@/lib/vocabConstants";

export interface VocabWord {
  id: number;
  session_id: string;
  word: string;
  meaning: string;
  examples: string[];
  relatedWords: string[];
  l4: {
    answer: string;
    options: string[];
  };
  l5: {
    chunks: string[];
    targetIndex: number;
    vocabDistractor: string;
    hints: string[];
    fullDistractors: string[];
  };
  displayOrder: number;
  sourceType: "manual" | "excel" | "bootstrap";
}

export interface VocabSession {
  id: string;
  category: VocabCategory;
  categoryLabel: string;
  subject: VocabSubject | null;
  sessionNo: number;
  label: string;
  isActive: boolean;
  wordCount: number;
}

export interface VocabCatalog {
  sessions: VocabSession[];
}

export interface VocabImportFailure {
  rowNumber: number;
  reason: string;
}

export interface VocabImportResult {
  insertedCount: number;
  skippedCount: number;
  failedRows: VocabImportFailure[];
  createdSessions: VocabSession[];
}

export interface CreateVocabWordInput {
  sessionId: string;
  word: string;
  meaning: string;
  examples: string[];
  relatedWords: string[];
  l4: {
    answer: string;
    options: string[];
  };
  l5: {
    chunks: string[];
    targetIndex: number;
    vocabDistractor: string;
    hints: string[];
    fullDistractors: string[];
  };
  displayOrder?: number;
}

let catalogCache: VocabCatalog | null = null;
const wordsCache = new Map<string, VocabWord[]>();

function normalizeSession(row: {
  id: string;
  category: VocabCategory;
  categoryLabel?: string;
  subject: VocabSubject | null;
  sessionNo: number;
  session_no?: number;
  label: string;
  isActive: boolean;
  is_active?: boolean;
  wordCount: number;
  word_count?: number;
}): VocabSession {
  return {
    id: row.id,
    category: row.category,
    categoryLabel: row.categoryLabel ?? VOCAB_CATEGORY_LABELS[row.category],
    subject: row.subject,
    sessionNo: row.sessionNo ?? row.session_no ?? 0,
    label: row.label,
    isActive: row.isActive ?? row.is_active ?? true,
    wordCount: row.wordCount ?? row.word_count ?? 0,
  };
}

function normalizeWord(row: any): VocabWord {
  return {
    id: row.id,
    session_id: row.session_id,
    word: row.word,
    meaning: row.meaning,
    examples: Array.isArray(row.examples) ? row.examples : [],
    relatedWords: Array.isArray(row.relatedWords)
      ? row.relatedWords
      : Array.isArray(row.related_words)
        ? row.related_words
        : [],
    l4: {
      answer: row.l4?.answer ?? "",
      options: Array.isArray(row.l4?.options) ? row.l4.options : [],
    },
    l5: {
      chunks: Array.isArray(row.l5?.chunks) ? row.l5.chunks : [],
      targetIndex: Number(row.l5?.targetIndex ?? 0),
      vocabDistractor: row.l5?.vocabDistractor ?? "",
      hints: Array.isArray(row.l5?.hints) ? row.l5.hints : [],
      fullDistractors: Array.isArray(row.l5?.fullDistractors) ? row.l5.fullDistractors : [],
    },
    displayOrder: row.displayOrder ?? row.display_order ?? 0,
    sourceType: row.sourceType ?? row.source_type ?? "manual",
  };
}

export async function getVocabCatalog(includeInactive = false): Promise<VocabCatalog> {
  if (!includeInactive && catalogCache) {
    return catalogCache;
  }

  const query = includeInactive ? "?includeInactive=true" : "";
  const result = await api<{ sessions: any[] }>(`/api/vocab/catalog${query}`);
  const catalog = { sessions: result.sessions.map(normalizeSession) };

  if (!includeInactive) {
    catalogCache = catalog;
  }

  return catalog;
}

export async function getVocabSessionWords(sessionId: string): Promise<VocabWord[]> {
  if (wordsCache.has(sessionId)) {
    return wordsCache.get(sessionId)!;
  }

  const rows = await api<any[]>(`/api/vocab/sessions/${sessionId}/words`);
  const words = rows.map(normalizeWord);
  wordsCache.set(sessionId, words);
  return words;
}

export async function createVocabSession(input: {
  category: VocabCategory;
  subject?: VocabSubject | null;
  sessionNo: number;
  label?: string;
}): Promise<VocabSession> {
  const row = await api<any>("/api/vocab/sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });

  invalidateVocabCache();
  return normalizeSession(row);
}

export async function updateVocabSession(sessionId: string, isActive: boolean): Promise<VocabSession> {
  const row = await api<any>(`/api/vocab/sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });

  invalidateVocabCache();
  return normalizeSession(row);
}

export async function createVocabWord(input: CreateVocabWordInput): Promise<VocabWord> {
  const row = await api<any>("/api/vocab/words", {
    method: "POST",
    body: JSON.stringify(input),
  });

  wordsCache.delete(input.sessionId);
  invalidateVocabCache();
  return normalizeWord(row);
}

export async function importVocabSpreadsheet(input: {
  file: File;
  category: VocabCategory;
  subject?: VocabSubject | null;
}): Promise<VocabImportResult> {
  const formData = new FormData();
  formData.append("file", input.file);
  formData.append("category", input.category);
  if (input.subject) {
    formData.append("subject", input.subject);
  }

  const result = await api<Omit<VocabImportResult, "createdSessions"> & { createdSessions: any[] }>("/api/vocab/import", {
    method: "POST",
    body: formData,
  });

  invalidateVocabCache();
  return {
    ...result,
    createdSessions: Array.isArray(result.createdSessions) ? result.createdSessions.map(normalizeSession) : [],
  };
}

export async function autoFillVocab(word: string): Promise<{ meaning: string; examples: string[] } | null> {
  try {
    const result = await api<{ meaning: string; examples: string[] }>(`/api/vocab/auto-fill?word=${encodeURIComponent(word)}`);
    return result.meaning ? result : null;
  } catch {
    return null;
  }
}

export async function refreshAllDefinitions(): Promise<{ updatedCount: number }> {
  return api<{ updatedCount: number }>("/api/vocab/refresh-definitions", { method: "POST" });
}

export interface AiGeneratedVocab {
  word: string;
  meaning: string;
  example: string;
}

export async function aiGenerateVocab(words: string[]): Promise<AiGeneratedVocab[]> {
  return api<AiGeneratedVocab[]>("/api/vocab/ai-generate", {
    method: "POST",
    body: JSON.stringify({ words }),
  });
}

export async function bulkCreateWords(
  sessionId: string,
  words: Array<{ word: string; meaning?: string; example?: string }>,
): Promise<{ insertedCount: number; words: VocabWord[] }> {
  const result = await api<{ insertedCount: number; words: any[] }>("/api/vocab/bulk-words", {
    method: "POST",
    body: JSON.stringify({
      sessionId,
      words: words.map((w) => ({
        word: w.word,
        meaning: w.meaning || "",
        examples: w.example ? [w.example] : [],
      })),
    }),
  });

  invalidateVocabCache();
  return {
    insertedCount: result.insertedCount,
    words: result.words.map(normalizeWord),
  };
}

export function invalidateVocabCache() {
  catalogCache = null;
  wordsCache.clear();
}

export function getToolSessions(catalog: VocabCatalog): VocabSession[] {
  return catalog.sessions.filter((session) => session.category === "tool" && session.isActive);
}

export function getContentSubjectGroups(catalog: VocabCatalog): Array<{ subject: VocabSubject; sessions: VocabSession[] }> {
  return VOCAB_SUBJECTS.map((subject) => ({
    subject,
    sessions: catalog.sessions.filter(
      (session) => session.category === "content" && session.subject === subject && session.isActive,
    ),
  })).filter((group) => group.sessions.length > 0);
}

export function getSessionDisplayName(session: VocabSession): string {
  if (session.category === "tool") {
    return `${VOCAB_CATEGORY_LABELS.tool} · ${session.label}`;
  }

  return `${VOCAB_CATEGORY_LABELS.content} · ${session.subject} · ${session.label}`;
}

export function generateBadWords(currentWord: VocabWord, allWords: VocabWord[], count: number = 4): string[] {
  const related = new Set([currentWord.word, ...currentWord.relatedWords]);
  const candidates = allWords.filter((word) => !related.has(word.word)).map((word) => word.word);
  return shuffle(candidates).slice(0, count);
}

export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function pick<T>(arr: T[], count: number): T[] {
  return shuffle(arr).slice(0, count);
}

export function getWordEmoji(word: string): string {
  const emojiMap: Record<string, string> = {
    움직임: "🏃",
    방식: "📋",
    영향: "💫",
    환경: "🌳",
    측정: "🔬",
    추측: "🤔",
    단서: "🔍",
    계획: "📝",
    개요: "📑",
    조사: "🔎",
    실행: "▶️",
    파악: "👁️",
    공통점: "🤝",
    차이점: "↔️",
    비교: "⚖️",
    해결: "✅",
    문제점: "⚠️",
    작품: "🎨",
    제출: "📤",
    상상: "🌈",
    관점: "👀",
    배경: "🖼️",
    분류: "📂",
    기준: "📐",
    도구: "🔧",
    연결: "🔗",
    요소: "🧩",
    선택: "☝️",
    판단: "⚖️",
    검토: "🧐",
    고려: "🤨",
    사례: "📋",
    연구: "🔬",
    설명: "🗣️",
    관찰: "👁️",
    주제: "📚",
    의미: "💬",
    상황: "🎬",
    내용: "📖",
    기록: "📝",
    요약: "📋",
    의견: "💬",
    미래: "🔮",
    발달: "📈",
  };

  return emojiMap[word] || "📝";
}

const PASTEL_COLORS = [
  "e0f2fe",
  "fef3c7",
  "dcfce7",
  "f3e8ff",
  "ffedd5",
  "fee2e2",
  "e0e7ff",
  "ccfbf1",
  "d1fae5",
  "fce7f3",
];

export function getWordColor(index: number): string {
  return PASTEL_COLORS[index % PASTEL_COLORS.length];
}
