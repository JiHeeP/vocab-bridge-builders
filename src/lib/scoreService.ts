import { supabase } from '@/integrations/supabase/client';

export interface StageScore {
  stage: number;
  score: number; // 0, 1, or 2
  timeSpent: number; // seconds
}

export interface WordStageScore {
  wordId: number;
  wordText: string;
  score: number;
  timeSpent: number;
}

export function calculateErrorRate(totalScore: number, maxScore: number): number {
  if (maxScore === 0) return 0;
  return Math.round((1 - totalScore / maxScore) * 1000) / 10;
}

export function getTier(errorRate: number): 'acquired' | 'developing' | 'tier2' | 'tier3' {
  if (errorRate <= 20) return 'acquired';
  if (errorRate <= 35) return 'developing';
  if (errorRate <= 50) return 'tier2';
  return 'tier3';
}

export function getTierLabel(tier: string): string {
  switch (tier) {
    case 'acquired': return '습득 완료';
    case 'developing': return '발달 중';
    case 'tier2': return 'Tier 2 (보충)';
    case 'tier3': return 'Tier 3 (집중)';
    default: return tier;
  }
}

export function getTierColor(tier: string): string {
  switch (tier) {
    case 'acquired': return 'text-success';
    case 'developing': return 'text-warning';
    case 'tier2': return 'text-orange-500';
    case 'tier3': return 'text-destructive';
    default: return 'text-muted-foreground';
  }
}

export function getTierBg(tier: string): string {
  switch (tier) {
    case 'acquired': return 'bg-success/10 border-success/30';
    case 'developing': return 'bg-warning/10 border-warning/30';
    case 'tier2': return 'bg-orange-50 border-orange-300';
    case 'tier3': return 'bg-destructive/10 border-destructive/30';
    default: return 'bg-muted';
  }
}

// Get or create student in DB
export async function getOrCreateStudent(name: string): Promise<string> {
  const { data } = await supabase
    .from('students')
    .select('id')
    .eq('name', name)
    .maybeSingle();

  if (data) return data.id;

  const { data: newStudent, error } = await supabase
    .from('students')
    .insert({ name })
    .select('id')
    .single();

  if (error) throw error;
  return newStudent!.id;
}

// Save learning records for a set
export async function saveLearningRecords(
  studentId: string,
  setIndex: number,
  wordScores: Map<number, { wordText: string; stages: Map<number, StageScore> }>
) {
  const records: any[] = [];

  for (const [wordId, data] of wordScores) {
    const stageResults: StageScore[] = [];
    let totalScore = 0;

    for (const [, result] of data.stages) {
      stageResults.push(result);
      totalScore += result.score;
    }

    if (stageResults.length === 0) continue;

    const maxScore = 8; // Steps 2-5, each max 2pts
    const errorRate = calculateErrorRate(totalScore, maxScore);
    const tier = getTier(errorRate);
    const completed = stageResults.length >= 4;

    records.push({
      student_id: studentId,
      word_id: wordId,
      word_text: data.wordText,
      set_index: setIndex,
      stage_results: stageResults,
      total_score: totalScore,
      max_score: maxScore,
      error_rate: errorRate,
      tier,
      completed,
    });
  }

  if (records.length === 0) return;

  const { error } = await supabase
    .from('learning_records')
    .insert(records);

  if (error) console.error('Error saving records:', error);
}

// Fetch student report data
export async function getStudentReport(studentId: string, from?: string, to?: string) {
  let query = supabase
    .from('learning_records')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Fetch all students
export async function getAllStudents() {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .order('name');

  if (error) throw error;
  return data || [];
}

// Fetch group report data
export async function getGroupReport(gradeClass: string, from?: string, to?: string) {
  let query = supabase
    .from('learning_records')
    .select('*, students!inner(name, is_multicultural, grade_class)')
    .eq('students.grade_class', gradeClass);

  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Fetch intervention logs
export async function getInterventionLogs(studentId?: string) {
  let query = supabase
    .from('intervention_logs')
    .select('*, students(name)')
    .order('created_at', { ascending: false });

  if (studentId) query = query.eq('student_id', studentId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Save intervention log
export async function saveInterventionLog(log: {
  student_id: string;
  intervention_type: string;
  focus_words: string[];
  duration_min: number;
  before_error_rate: number;
  after_error_rate?: number;
  memo?: string;
}) {
  const { error } = await supabase
    .from('intervention_logs')
    .insert({
      ...log,
      focus_words: log.focus_words as any,
    });

  if (error) throw error;
}
