import { api } from "@/lib/api";
import type { VocabSession } from "@/lib/vocabData";

export interface StageScore {
  stage: number;
  score: number;
  timeSpent: number;
}

export interface WordStageScore {
  wordId: number;
  wordText: string;
  score: number;
  timeSpent: number;
}

export interface StudentData {
  id: string;
  name: string;
  is_multicultural: boolean;
  grade_class: string;
  created_at?: string;
}

export interface LearningRecord {
  id: string;
  student_id: string;
  vocab_session_id?: string | null;
  word_id: number;
  word_text: string;
  set_index: number;
  stage_results: StageScore[];
  total_score: number;
  max_score: number;
  error_rate: number;
  tier: string;
  completed: boolean;
  created_at: string;
}

export interface InterventionLog {
  id: string;
  student_id: string;
  intervention_type: string;
  focus_words: string[];
  duration_min: number;
  before_error_rate: number | null;
  after_error_rate: number | null;
  memo: string | null;
  created_at: string;
  student?: { name: string };
}

export function calculateErrorRate(totalScore: number, maxScore: number): number {
  if (maxScore === 0) return 0;
  return Math.round((1 - totalScore / maxScore) * 1000) / 10;
}

export function getTier(errorRate: number): "acquired" | "developing" | "tier2" | "tier3" {
  if (errorRate <= 20) return "acquired";
  if (errorRate <= 35) return "developing";
  if (errorRate <= 50) return "tier2";
  return "tier3";
}

export function getTierLabel(tier: string): string {
  switch (tier) {
    case "acquired":
      return "습득 완료";
    case "developing":
      return "발달 중";
    case "tier2":
      return "Tier 2 (보충)";
    case "tier3":
      return "Tier 3 (집중)";
    default:
      return tier;
  }
}

export function getTierColor(tier: string): string {
  switch (tier) {
    case "acquired":
      return "text-success";
    case "developing":
      return "text-warning";
    case "tier2":
      return "text-orange-500";
    case "tier3":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

export function getTierBg(tier: string): string {
  switch (tier) {
    case "acquired":
      return "bg-success/10 border-success/30";
    case "developing":
      return "bg-warning/10 border-warning/30";
    case "tier2":
      return "bg-orange-50 border-orange-300";
    case "tier3":
      return "bg-destructive/10 border-destructive/30";
    default:
      return "bg-muted";
  }
}

export async function getOrCreateStudent(name: string): Promise<string> {
  const student = await api<StudentData>("/api/students/get-or-create", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

  return student.id;
}

export async function saveLearningRecords(
  studentId: string,
  session: Pick<VocabSession, "id" | "sessionNo">,
  wordScores: Map<number, { wordText: string; stages: Map<number, StageScore> }>,
) {
  const records: Array<{
    student_id: string;
    vocab_session_id: string;
    word_id: number;
    word_text: string;
    set_index: number;
    stage_results: StageScore[];
    total_score: number;
    max_score: number;
    error_rate: number;
    tier: string;
    completed: boolean;
  }> = [];

  for (const [wordId, data] of wordScores) {
    const stageResults: StageScore[] = [];
    let totalScore = 0;

    for (const [, result] of data.stages) {
      stageResults.push(result);
      totalScore += result.score;
    }

    if (stageResults.length === 0) continue;

    const maxScore = 8;
    const errorRate = calculateErrorRate(totalScore, maxScore);
    const tier = getTier(errorRate);
    const completed = stageResults.length >= 4;

    records.push({
      student_id: studentId,
      vocab_session_id: session.id,
      word_id: wordId,
      word_text: data.wordText,
      set_index: session.sessionNo,
      stage_results: stageResults,
      total_score: totalScore,
      max_score: maxScore,
      error_rate: errorRate,
      tier,
      completed,
    });
  }

  if (records.length === 0) return;

  await api<LearningRecord[]>("/api/learning-records", {
    method: "POST",
    body: JSON.stringify({ records }),
  });
}

export async function getLearningRecords(filters: {
  studentId?: string;
  from?: string;
  to?: string;
} = {}) {
  const params = new URLSearchParams();

  if (filters.studentId) params.set("studentId", filters.studentId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);

  const query = params.toString();
  return api<LearningRecord[]>(`/api/learning-records${query ? `?${query}` : ""}`);
}

export async function getStudentReport(studentId: string, from?: string, to?: string) {
  return getLearningRecords({ studentId, from, to });
}

export async function getAllStudents() {
  return api<StudentData[]>("/api/students");
}

export async function getGroupReport(gradeClass: string, from?: string, to?: string) {
  const params = new URLSearchParams({ gradeClass });

  if (from) params.set("from", from);
  if (to) params.set("to", to);

  return api<Array<LearningRecord & { student: Pick<StudentData, "name" | "is_multicultural" | "grade_class"> }>>(
    `/api/learning-records/group?${params}`,
  );
}

export async function getInterventionLogs(studentId?: string) {
  const query = studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";
  return api<InterventionLog[]>(`/api/intervention-logs${query}`);
}

export async function saveInterventionLog(log: {
  student_id: string;
  intervention_type: string;
  focus_words: string[];
  duration_min: number;
  before_error_rate: number;
  after_error_rate?: number;
  memo?: string;
}) {
  return api<InterventionLog>("/api/intervention-logs", {
    method: "POST",
    body: JSON.stringify(log),
  });
}
