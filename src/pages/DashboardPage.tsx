import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, User, BarChart3, FileText, Printer, AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Settings, ClipboardList } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getTierLabel, getTierColor, getTierBg, calculateErrorRate, getTier } from '@/lib/scoreService';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ContentManagementTab from '@/components/dashboard/ContentManagementTab';

interface StudentData {
  id: string;
  name: string;
  is_multicultural: boolean;
  grade_class: string;
}

interface LearningRecord {
  id: string;
  student_id: string;
  word_id: number;
  word_text: string;
  set_index: number;
  stage_results: any;
  total_score: number;
  max_score: number;
  error_rate: number;
  tier: string;
  completed: boolean;
  created_at: string;
}

const DashboardPage = () => {
  const navigate = useNavigate();
  const [students, setStudents] = useState<StudentData[]>([]);
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'all'>('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [studentsRes, recordsRes] = await Promise.all([
      supabase.from('students').select('*').order('name'),
      supabase.from('learning_records').select('*').order('created_at', { ascending: false }),
    ]);
    setStudents(studentsRes.data || []);
    setRecords(recordsRes.data || []);
    setLoading(false);
  };

  const getDateFilter = () => {
    const now = new Date();
    if (dateRange === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return weekAgo.toISOString();
    }
    if (dateRange === 'month') {
      const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      return monthAgo.toISOString();
    }
    return null;
  };

  const filteredRecords = (studentId?: string) => {
    let filtered = records;
    const dateFilter = getDateFilter();
    if (dateFilter) filtered = filtered.filter(r => r.created_at >= dateFilter);
    if (studentId) filtered = filtered.filter(r => r.student_id === studentId);
    return filtered;
  };

  // Student summary stats
  const getStudentSummary = (studentId: string) => {
    const recs = filteredRecords(studentId);
    if (recs.length === 0) return null;
    const totalScore = recs.reduce((sum, r) => sum + r.total_score, 0);
    const maxScore = recs.reduce((sum, r) => sum + r.max_score, 0);
    const avgErrorRate = maxScore > 0 ? calculateErrorRate(totalScore, maxScore) : 0;
    const tier2Count = recs.filter(r => r.tier === 'tier2').length;
    const tier3Count = recs.filter(r => r.tier === 'tier3').length;
    const completedCount = recs.filter(r => r.completed).length;
    return { totalScore, maxScore, avgErrorRate, tier2Count, tier3Count, completedCount, totalWords: recs.length };
  };

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">데이터 불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-body print:bg-white">
      <header className="bg-primary text-primary-foreground px-4 py-4 flex items-center justify-between print:bg-white print:text-foreground print:border-b">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-primary-foreground/10 print:hidden">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-bold font-display">교사 대시보드</h1>
            <p className="text-sm opacity-80">학습 리포트 · 어휘의 징검다리</p>
          </div>
        </div>
        <button onClick={handlePrint} className="flex items-center gap-2 bg-primary-foreground/10 px-4 py-2 rounded-lg hover:bg-primary-foreground/20 print:hidden">
          <Printer size={16} /> PDF 출력
        </button>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        <Tabs defaultValue="content" className="print:block">
          <TabsList className="mb-6 print:hidden">
            <TabsTrigger value="content" className="flex items-center gap-2"><Settings size={16} /> 콘텐츠 관리</TabsTrigger>
            <TabsTrigger value="results" className="flex items-center gap-2"><ClipboardList size={16} /> 결과 관리</TabsTrigger>
          </TabsList>

          {/* Content Management Tab */}
          <TabsContent value="content">
            <ContentManagementTab students={students} onRefreshStudents={loadData} />
          </TabsContent>

          {/* Results Management Tab */}
          <TabsContent value="results">
            <Tabs defaultValue="individual" className="print:block">
              <TabsList className="mb-6 print:hidden">
                <TabsTrigger value="individual" className="flex items-center gap-2"><User size={16} /> 개인 리포트</TabsTrigger>
                <TabsTrigger value="group" className="flex items-center gap-2"><Users size={16} /> 그룹 리포트</TabsTrigger>
              </TabsList>

              {/* Date filter */}
              <div className="flex gap-2 mb-6 print:hidden">
                {(['all', 'month', 'week'] as const).map(range => (
                  <button key={range} onClick={() => setDateRange(range)}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${dateRange === range ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-foreground hover:bg-muted'}`}
                  >
                    {range === 'all' ? '전체' : range === 'month' ? '이번 달' : '이번 주'}
                  </button>
                ))}
              </div>

              {/* Level 2: Individual Report */}
              <TabsContent value="individual">
                {!selectedStudent ? (
                  <div>
                    <h2 className="text-xl font-bold text-foreground mb-4">학생 목록</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {students.map(student => {
                        const summary = getStudentSummary(student.id);
                        return (
                          <button key={student.id} onClick={() => setSelectedStudent(student)}
                            className="bg-card border border-border rounded-2xl p-5 text-left hover:border-primary hover:shadow-md transition-all"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold">
                                  {student.name[0]}
                                </div>
                                <div>
                                  <div className="font-bold text-foreground text-lg">{student.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {student.grade_class} · {student.is_multicultural ? '다문화' : '일반'}
                                  </div>
                                </div>
                              </div>
                              {summary && (
                                <div className={`px-3 py-1 rounded-full text-xs font-bold border ${getTierBg(getTier(summary.avgErrorRate))} ${getTierColor(getTier(summary.avgErrorRate))}`}>
                                  {getTierLabel(getTier(summary.avgErrorRate))}
                                </div>
                              )}
                            </div>
                            {summary ? (
                              <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="bg-muted rounded-lg p-2">
                                  <div className="text-xs text-muted-foreground">오류율</div>
                                  <div className="font-bold text-foreground">{summary.avgErrorRate.toFixed(1)}%</div>
                                </div>
                                <div className="bg-muted rounded-lg p-2">
                                  <div className="text-xs text-muted-foreground">학습 단어</div>
                                  <div className="font-bold text-foreground">{summary.totalWords}개</div>
                                </div>
                                <div className="bg-muted rounded-lg p-2">
                                  <div className="text-xs text-muted-foreground">위험 단어</div>
                                  <div className={`font-bold ${summary.tier3Count > 0 ? 'text-destructive' : 'text-foreground'}`}>
                                    {summary.tier2Count + summary.tier3Count}개
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground">학습 기록 없음</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {students.length === 0 && (
                      <div className="text-center py-12 text-muted-foreground">
                        <Users className="w-16 h-16 mx-auto mb-4 opacity-30" />
                        <p>아직 학습 기록이 없습니다.</p>
                        <p className="text-sm">학생이 게임을 완료하면 여기에 표시됩니다.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <StudentReport
                    student={selectedStudent}
                    records={filteredRecords(selectedStudent.id)}
                    onBack={() => setSelectedStudent(null)}
                  />
                )}
              </TabsContent>

              {/* Level 3: Group Report */}
              <TabsContent value="group">
                <GroupReport students={students} records={filteredRecords()} />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

// Level 2: Student Individual Report
const StudentReport: React.FC<{
  student: StudentData;
  records: LearningRecord[];
  onBack: () => void;
}> = ({ student, records, onBack }) => {
  if (records.length === 0) {
    return (
      <div className="text-center py-12">
        <button onClick={onBack} className="mb-4 text-primary font-bold hover:underline print:hidden">← 목록으로</button>
        <p className="text-muted-foreground">이 학생의 학습 기록이 없습니다.</p>
      </div>
    );
  }

  const totalScore = records.reduce((s, r) => s + r.total_score, 0);
  const maxScore = records.reduce((s, r) => s + r.max_score, 0);
  const overallErrorRate = calculateErrorRate(totalScore, maxScore);
  const overallTier = getTier(overallErrorRate);

  // Stage-by-stage breakdown
  const stageScores: Record<number, { total: number; max: number; count: number }> = {};
  for (const rec of records) {
    const stages = Array.isArray(rec.stage_results) ? rec.stage_results : [];
    for (const s of stages) {
      if (!stageScores[s.stage]) stageScores[s.stage] = { total: 0, max: 0, count: 0 };
      stageScores[s.stage].total += s.score;
      stageScores[s.stage].max += 2;
      stageScores[s.stage].count += 1;
    }
  }

  // Sort words by error rate (highest first)
  const sortedRecords = [...records].sort((a, b) => b.error_rate - a.error_rate);

  const tier2Words = records.filter(r => r.tier === 'tier2');
  const tier3Words = records.filter(r => r.tier === 'tier3');
  const firstTryCount = records.filter(r => {
    const stages = Array.isArray(r.stage_results) ? r.stage_results : [];
    return stages.every((s: any) => s.score === 2);
  }).length;

  return (
    <div>
      <button onClick={onBack} className="mb-4 text-primary font-bold hover:underline print:hidden">← 목록으로</button>

      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6 print:border-2">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground">{student.name} 학생 리포트</h2>
            <p className="text-sm text-muted-foreground">{student.grade_class} · {student.is_multicultural ? '다문화' : '일반'}</p>
          </div>
          <div className={`px-4 py-2 rounded-xl text-lg font-bold border-2 ${getTierBg(overallTier)} ${getTierColor(overallTier)}`}>
            {getTierLabel(overallTier)}
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-muted rounded-xl p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">종합 점수</div>
            <div className="text-2xl font-bold text-foreground">{totalScore} / {maxScore}</div>
          </div>
          <div className="bg-muted rounded-xl p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">종합 오류율</div>
            <div className={`text-2xl font-bold ${getTierColor(overallTier)}`}>{overallErrorRate.toFixed(1)}%</div>
          </div>
          <div className="bg-muted rounded-xl p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">Tier 2 단어</div>
            <div className="text-2xl font-bold text-orange-500">{tier2Words.length}</div>
          </div>
          <div className="bg-muted rounded-xl p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">Tier 3 단어</div>
            <div className="text-2xl font-bold text-destructive">{tier3Words.length}</div>
          </div>
          <div className="bg-muted rounded-xl p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">1차 정답률</div>
            <div className="text-2xl font-bold text-foreground">
              {records.length > 0 ? Math.round((firstTryCount / records.length) * 100) : 0}%
            </div>
          </div>
        </div>
      </div>

      {/* Stage breakdown */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6">
        <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
          <BarChart3 size={20} className="text-primary" /> 단계별 수행률
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[2, 3, 4, 5].map(stage => {
            const data = stageScores[stage];
            const rate = data ? Math.round((data.total / data.max) * 100) : 0;
            const stepNames = ['', '', '매칭', '관련어', '음절블록', '퀴즈+문장'];
            return (
              <div key={stage} className="bg-muted rounded-xl p-4">
                <div className="text-xs text-muted-foreground mb-1">Step {stage}. {stepNames[stage]}</div>
                <div className="text-2xl font-bold text-foreground">{rate}%</div>
                <div className="w-full bg-border rounded-full h-2 mt-2">
                  <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${rate}%` }} />
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {data ? `${data.total}/${data.max}점 (${data.count}개)` : '데이터 없음'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Word detail table */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
          <FileText size={20} className="text-primary" /> 단어별 상세 (오류율 높은 순)
        </h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>단어</TableHead>
                <TableHead className="text-center">점수</TableHead>
                <TableHead className="text-center">오류율</TableHead>
                <TableHead className="text-center">분류</TableHead>
                <TableHead className="text-center">S2</TableHead>
                <TableHead className="text-center">S3</TableHead>
                <TableHead className="text-center">S4</TableHead>
                <TableHead className="text-center">S5</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRecords.map(rec => {
                const stages = Array.isArray(rec.stage_results) ? rec.stage_results : [];
                const stageMap: Record<number, number> = {};
                stages.forEach((s: any) => { stageMap[s.stage] = s.score; });
                return (
                  <TableRow key={rec.id}>
                    <TableCell className="font-bold">{rec.word_text}</TableCell>
                    <TableCell className="text-center">{rec.total_score}/{rec.max_score}</TableCell>
                    <TableCell className="text-center">
                      <span className={`font-bold ${getTierColor(rec.tier)}`}>{rec.error_rate.toFixed(1)}%</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold border ${getTierBg(rec.tier)} ${getTierColor(rec.tier)}`}>
                        {getTierLabel(rec.tier)}
                      </span>
                    </TableCell>
                    {[2, 3, 4, 5].map(s => (
                      <TableCell key={s} className="text-center">
                        {stageMap[s] !== undefined ? (
                          <span className={`font-bold ${stageMap[s] === 2 ? 'text-success' : stageMap[s] === 1 ? 'text-warning' : 'text-destructive'}`}>
                            {stageMap[s]}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Tier 2/3 focus words */}
      {(tier2Words.length > 0 || tier3Words.length > 0) && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-6 mt-6">
          <h3 className="text-lg font-bold text-destructive mb-4 flex items-center gap-2">
            <AlertTriangle size={20} /> 집중 관리 필요 단어
          </h3>
          <div className="flex flex-wrap gap-2">
            {tier3Words.map(r => (
              <span key={r.id} className="bg-destructive/10 text-destructive border border-destructive/30 px-3 py-1 rounded-full text-sm font-bold">
                🔴 {r.word_text} ({r.error_rate.toFixed(1)}%)
              </span>
            ))}
            {tier2Words.map(r => (
              <span key={r.id} className="bg-orange-50 text-orange-600 border border-orange-300 px-3 py-1 rounded-full text-sm font-bold">
                🟠 {r.word_text} ({r.error_rate.toFixed(1)}%)
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Level 3: Group Report
const GroupReport: React.FC<{
  students: StudentData[];
  records: LearningRecord[];
}> = ({ students, records }) => {
  if (records.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-30" />
        <p>학습 기록이 없습니다.</p>
      </div>
    );
  }

  const multiculturalIds = new Set(students.filter(s => s.is_multicultural).map(s => s.id));
  const generalRecords = records.filter(r => !multiculturalIds.has(r.student_id));
  const multiRecords = records.filter(r => multiculturalIds.has(r.student_id));

  const calcGroupStats = (recs: LearningRecord[]) => {
    if (recs.length === 0) return { avgErrorRate: 0, avgScore: 0, count: 0, stageRates: {} as Record<number, number> };
    const totalScore = recs.reduce((s, r) => s + r.total_score, 0);
    const maxScore = recs.reduce((s, r) => s + r.max_score, 0);

    const stageScores: Record<number, { total: number; max: number }> = {};
    for (const rec of recs) {
      const stages = Array.isArray(rec.stage_results) ? rec.stage_results : [];
      for (const s of stages) {
        if (!stageScores[s.stage]) stageScores[s.stage] = { total: 0, max: 0 };
        stageScores[s.stage].total += s.score;
        stageScores[s.stage].max += 2;
      }
    }
    const stageRates: Record<number, number> = {};
    for (const [stage, data] of Object.entries(stageScores)) {
      stageRates[Number(stage)] = data.max > 0 ? Math.round((data.total / data.max) * 100) : 0;
    }

    return {
      avgErrorRate: maxScore > 0 ? calculateErrorRate(totalScore, maxScore) : 0,
      avgScore: recs.length > 0 ? Math.round(totalScore / recs.length * 10) / 10 : 0,
      count: recs.length,
      stageRates,
    };
  };

  const allStats = calcGroupStats(records);
  const generalStats = calcGroupStats(generalRecords);
  const multiStats = calcGroupStats(multiRecords);

  // Common weak words across multicultural group
  const multiWordScores: Record<string, { total: number; max: number; count: number }> = {};
  for (const rec of multiRecords) {
    if (!multiWordScores[rec.word_text]) multiWordScores[rec.word_text] = { total: 0, max: 0, count: 0 };
    multiWordScores[rec.word_text].total += rec.total_score;
    multiWordScores[rec.word_text].max += rec.max_score;
    multiWordScores[rec.word_text].count += 1;
  }
  const weakWords = Object.entries(multiWordScores)
    .map(([word, data]) => ({ word, errorRate: calculateErrorRate(data.total, data.max) }))
    .filter(w => w.errorRate > 35)
    .sort((a, b) => b.errorRate - a.errorRate)
    .slice(0, 10);

  const stepNames: Record<number, string> = { 2: '매칭', 3: '관련어', 4: '음절블록', 5: '퀴즈+문장' };

  return (
    <div>
      <h2 className="text-xl font-bold text-foreground mb-6">월간 그룹 비교 리포트</h2>

      {/* Group comparison */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[
          { label: '전체', stats: allStats, color: 'primary' },
          { label: '일반 학생', stats: generalStats, color: 'primary' },
          { label: '다문화 학생', stats: multiStats, color: 'secondary' },
        ].map(group => (
          <div key={group.label} className="bg-card border border-border rounded-2xl p-5">
            <div className="text-sm text-muted-foreground mb-2 font-bold">{group.label}</div>
            <div className="text-3xl font-bold text-foreground mb-1">{group.stats.avgErrorRate.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground">평균 오류율 · {group.stats.count}개 기록</div>
          </div>
        ))}
      </div>

      {/* Gap analysis */}
      {multiRecords.length > 0 && generalRecords.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-6 mb-6">
          <h3 className="text-lg font-bold text-foreground mb-4">단계별 격차 분석</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>단계</TableHead>
                <TableHead className="text-center">전체 정답률</TableHead>
                <TableHead className="text-center">다문화 정답률</TableHead>
                <TableHead className="text-center">격차</TableHead>
                <TableHead className="text-center">추이</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[2, 3, 4, 5].map(stage => {
                const genRate = generalStats.stageRates[stage] || 0;
                const multiRate = multiStats.stageRates[stage] || 0;
                const gap = genRate - multiRate;
                return (
                  <TableRow key={stage}>
                    <TableCell className="font-bold">Step {stage}. {stepNames[stage]}</TableCell>
                    <TableCell className="text-center">{genRate}%</TableCell>
                    <TableCell className="text-center">{multiRate}%</TableCell>
                    <TableCell className="text-center">
                      <span className={`font-bold ${gap > 10 ? 'text-destructive' : gap > 5 ? 'text-warning' : 'text-success'}`}>
                        {gap > 0 ? '+' : ''}{gap}%p
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {gap > 10 ? <TrendingDown className="inline text-destructive" size={16} /> :
                       gap > 5 ? <AlertTriangle className="inline text-warning" size={16} /> :
                       <CheckCircle className="inline text-success" size={16} />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Weak words */}
      {weakWords.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-6 mb-6">
          <h3 className="text-lg font-bold text-foreground mb-4">다문화 그룹 공통 취약 단어 (Top 10)</h3>
          <div className="flex flex-wrap gap-2">
            {weakWords.map(w => (
              <span key={w.word} className={`px-3 py-1 rounded-full text-sm font-bold border ${getTierBg(getTier(w.errorRate))} ${getTierColor(getTier(w.errorRate))}`}>
                {w.word} ({w.errorRate.toFixed(1)}%)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Per-student overview */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="text-lg font-bold text-foreground mb-4">학생별 요약</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead className="text-center">구분</TableHead>
              <TableHead className="text-center">학습 단어</TableHead>
              <TableHead className="text-center">오류율</TableHead>
              <TableHead className="text-center">분류</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map(s => {
              const recs = records.filter(r => r.student_id === s.id);
              if (recs.length === 0) return null;
              const total = recs.reduce((sum, r) => sum + r.total_score, 0);
              const max = recs.reduce((sum, r) => sum + r.max_score, 0);
              const errorRate = max > 0 ? calculateErrorRate(total, max) : 0;
              const tier = getTier(errorRate);
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-bold">{s.name}</TableCell>
                  <TableCell className="text-center text-sm">{s.is_multicultural ? '다문화' : '일반'}</TableCell>
                  <TableCell className="text-center">{recs.length}</TableCell>
                  <TableCell className="text-center">
                    <span className={`font-bold ${getTierColor(tier)}`}>{errorRate.toFixed(1)}%</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold border ${getTierBg(tier)} ${getTierColor(tier)}`}>
                      {getTierLabel(tier)}
                    </span>
                  </TableCell>
                </TableRow>
              );
            }).filter(Boolean)}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default DashboardPage;
