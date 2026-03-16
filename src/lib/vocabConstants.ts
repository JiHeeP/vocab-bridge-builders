export const VOCAB_CATEGORIES = ["tool", "content"] as const;
export type VocabCategory = (typeof VOCAB_CATEGORIES)[number];

export const VOCAB_SUBJECTS = ["국어", "수학", "사회", "과학", "예체능", "기타"] as const;
export type VocabSubject = (typeof VOCAB_SUBJECTS)[number];

export const VOCAB_CATEGORY_LABELS: Record<VocabCategory, string> = {
  tool: "학습 도구어",
  content: "학습 내용어",
};

export const DEFAULT_SESSION_LABEL = "세션";

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
