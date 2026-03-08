import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, BookOpen, CheckCircle, FolderKanban, GraduationCap, Loader2 } from "lucide-react";
import Step01Card from "@/components/games/Step01Card";
import Step02Matching from "@/components/games/Step02Matching";
import Step03RelatedWords from "@/components/games/Step03RelatedWords";
import Step04SyllableBlock from "@/components/games/Step04SyllableBlock";
import Step05VocabQuiz from "@/components/games/Step05VocabQuiz";
import Step06VocabShower from "@/components/games/Step06VocabShower";
import {
  getContentSubjectGroups,
  getSessionDisplayName,
  getToolSessions,
  getVocabCatalog,
  getVocabSessionWords,
  type VocabCatalog,
  type VocabSession,
  type VocabSubject,
  type VocabWord,
} from "@/lib/vocabData";
import { getOrCreateStudent, saveLearningRecords, type StageScore, type WordStageScore } from "@/lib/scoreService";
import { VOCAB_CATEGORY_LABELS } from "@/lib/vocabConstants";
import { toast } from "@/hooks/use-toast";

const STEPS = [
  { id: 1, name: "멀티모달 카드", desc: "Form × Reception" },
  { id: 2, name: "N+2 매칭 게임", desc: "Form·Meaning × Reception" },
  { id: 3, name: "관련어 고르기", desc: "Meaning × Reception" },
  { id: 4, name: "음절 블록 조립", desc: "Form × Production" },
  { id: 5, name: "어휘 퀴즈 + 문장", desc: "Meaning·Use × Production" },
  { id: 6, name: "어휘 소나기", desc: "Meaning × Automatization" },
];

const LearningPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const studentName = searchParams.get("student") || "학생";

  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<VocabCatalog>({ sessions: [] });
  const [selectedCategory, setSelectedCategory] = useState<"tool" | "content" | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<VocabSubject | null>(null);
  const [selectedSession, setSelectedSession] = useState<VocabSession | null>(null);
  const [sessionWords, setSessionWords] = useState<VocabWord[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [studentId, setStudentId] = useState<string | null>(null);

  const wordScoresRef = useRef<Map<number, { wordText: string; stages: Map<number, StageScore> }>>(new Map());

  useEffect(() => {
    Promise.all([
      getVocabCatalog(),
      getOrCreateStudent(studentName).catch((error) => {
        console.error("Student lookup failed:", error);
        return null;
      }),
    ]).then(([catalogResult, createdStudentId]) => {
      setCatalog(catalogResult);
      if (createdStudentId) {
        setStudentId(createdStudentId);
      }
      setLoading(false);
    });
  }, [studentName]);

  useEffect(() => {
    if (!selectedSession) {
      setSessionWords([]);
      return;
    }

    setSessionLoading(true);
    getVocabSessionWords(selectedSession.id)
      .then((words) => setSessionWords(words))
      .finally(() => setSessionLoading(false));
  }, [selectedSession]);

  const toolSessions = useMemo(() => getToolSessions(catalog), [catalog]);
  const contentGroups = useMemo(() => getContentSubjectGroups(catalog), [catalog]);

  const resetProgress = () => {
    wordScoresRef.current = new Map();
    setCompletedSteps([]);
    setCurrentStep(0);
  };

  const handleCategorySelect = (category: "tool" | "content") => {
    resetProgress();
    setSelectedCategory(category);
    setSelectedSubject(null);
    setSelectedSession(null);
  };

  const handleSubjectSelect = (subject: VocabSubject) => {
    resetProgress();
    setSelectedSubject(subject);
    setSelectedSession(null);
  };

  const handleSessionSelect = (session: VocabSession) => {
    resetProgress();
    setSelectedSession(session);
  };

  const handleStepComplete = async (scores?: WordStageScore[]) => {
    const step = currentStep;
    setCompletedSteps((prev) => [...new Set([...prev, step])]);

    if (scores && step >= 2 && step <= 5) {
      for (const score of scores) {
        if (!wordScoresRef.current.has(score.wordId)) {
          wordScoresRef.current.set(score.wordId, { wordText: score.wordText, stages: new Map() });
        }
        wordScoresRef.current.get(score.wordId)!.stages.set(step, {
          stage: step,
          score: score.score,
          timeSpent: score.timeSpent,
        });
      }

      const completedStageCount = new Set([...completedSteps, step].filter((value) => value >= 2 && value <= 5)).size;
      if (completedStageCount >= 2 && studentId && selectedSession) {
        try {
          await saveLearningRecords(studentId, selectedSession, wordScoresRef.current);
          toast({
            title: "학습 기록 저장됨",
            description: `${selectedSession.label}에서 ${completedStageCount}개 단계가 저장되었습니다.`,
          });
        } catch (error) {
          console.error("Save failed:", error);
        }
      }
    }

    if (currentStep < 6) {
      setCurrentStep(currentStep + 1);
    } else {
      setCurrentStep(0);
    }
  };

  const handleStepBack = () => setCurrentStep(0);

  const handleSessionBack = () => {
    resetProgress();
    setSelectedSession(null);
  };

  const handleSubjectBack = () => {
    resetProgress();
    setSelectedSubject(null);
    setSelectedSession(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground font-bold">어휘 카탈로그를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (selectedSession && currentStep >= 1 && currentStep <= 6) {
    if (sessionLoading) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground font-bold">세션 어휘를 불러오는 중...</p>
          </div>
        </div>
      );
    }

    const gameProps = {
      words: sessionWords,
      allWords: sessionWords,
      onComplete: handleStepComplete,
      onBack: handleStepBack,
    };

    if (currentStep === 1) return <Step01Card {...gameProps} />;
    if (currentStep === 2) return <Step02Matching {...gameProps} />;
    if (currentStep === 3) return <Step03RelatedWords {...gameProps} />;
    if (currentStep === 4) return <Step04SyllableBlock {...gameProps} />;
    if (currentStep === 5) return <Step05VocabQuiz {...gameProps} />;
    if (currentStep === 6) return <Step06VocabShower {...gameProps} />;
  }

  return (
    <div className="min-h-screen bg-background font-body">
      <header className="bg-primary text-primary-foreground px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => {
            if (selectedSession) {
              handleSessionBack();
              return;
            }
            if (selectedCategory === "content" && selectedSubject) {
              handleSubjectBack();
              return;
            }
            if (selectedCategory) {
              setSelectedCategory(null);
              setSelectedSubject(null);
              return;
            }
            navigate("/");
          }}
          className="p-2 rounded-lg hover:bg-primary-foreground/10 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-bold font-display">어휘의 징검다리</h1>
          <p className="text-sm opacity-80">
            {studentName} 학생
            {selectedSession ? ` · ${getSessionDisplayName(selectedSession)}` : ""}
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-6">
        {!selectedCategory && (
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">어휘군을 선택하세요</h2>
            <p className="text-muted-foreground mb-6">먼저 학습할 어휘군을 고르고, 그 다음 세션을 선택합니다.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => handleCategorySelect("tool")}
                className="bg-card border-2 border-border hover:border-primary hover:bg-primary/5 rounded-3xl p-6 text-left shadow-sm transition-all"
              >
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <BookOpen className="text-primary" size={28} />
                </div>
                <div className="text-xl font-bold text-foreground mb-2">{VOCAB_CATEGORY_LABELS.tool}</div>
                <div className="text-sm text-muted-foreground">
                  현재 등록된 세션 {toolSessions.length}개
                </div>
              </button>

              <button
                onClick={() => handleCategorySelect("content")}
                disabled={contentGroups.length === 0}
                className="bg-card border-2 border-border hover:border-primary hover:bg-primary/5 rounded-3xl p-6 text-left shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <GraduationCap className="text-primary" size={28} />
                </div>
                <div className="text-xl font-bold text-foreground mb-2">{VOCAB_CATEGORY_LABELS.content}</div>
                <div className="text-sm text-muted-foreground">
                  {contentGroups.length > 0
                    ? `등록된 과목 ${contentGroups.length}개`
                    : "아직 등록된 학습 내용어가 없습니다."}
                </div>
              </button>
            </div>
          </div>
        )}

        {selectedCategory === "tool" && !selectedSession && (
          <div>
            <div className="flex items-center gap-2 mb-2 text-primary font-bold">
              <BookOpen size={18} /> {VOCAB_CATEGORY_LABELS.tool}
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">세션을 선택하세요</h2>
            <p className="text-muted-foreground mb-6">세션별 어휘를 학습합니다.</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {toolSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => handleSessionSelect(session)}
                  className="bg-card border-2 border-border hover:border-primary hover:bg-primary/5 rounded-2xl p-5 text-center transition-all shadow-sm"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold mx-auto mb-3">
                    {session.sessionNo}
                  </div>
                  <div className="font-bold text-foreground text-lg">{session.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">{session.wordCount}개 어휘</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedCategory === "content" && !selectedSubject && (
          <div>
            <div className="flex items-center gap-2 mb-2 text-primary font-bold">
              <GraduationCap size={18} /> {VOCAB_CATEGORY_LABELS.content}
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">과목을 선택하세요</h2>
            <p className="text-muted-foreground mb-6">과목을 고른 뒤 세션을 선택합니다.</p>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {contentGroups.map((group) => (
                <button
                  key={group.subject}
                  onClick={() => handleSubjectSelect(group.subject)}
                  className="bg-card border-2 border-border hover:border-primary hover:bg-primary/5 rounded-2xl p-5 text-left shadow-sm transition-all"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                    <FolderKanban className="text-primary" size={22} />
                  </div>
                  <div className="font-bold text-foreground text-lg">{group.subject}</div>
                  <div className="text-xs text-muted-foreground mt-1">{group.sessions.length}개 세션</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedCategory === "content" && selectedSubject && !selectedSession && (
          <div>
            <div className="flex items-center gap-2 mb-2 text-primary font-bold">
              <GraduationCap size={18} /> {VOCAB_CATEGORY_LABELS.content} · {selectedSubject}
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">세션을 선택하세요</h2>
            <p className="text-muted-foreground mb-6">과목별 세션 중 학습할 세션을 고릅니다.</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {contentGroups
                .find((group) => group.subject === selectedSubject)
                ?.sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => handleSessionSelect(session)}
                    className="bg-card border-2 border-border hover:border-primary hover:bg-primary/5 rounded-2xl p-5 text-center transition-all shadow-sm"
                  >
                    <div className="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold mx-auto mb-3">
                      {session.sessionNo}
                    </div>
                    <div className="font-bold text-foreground text-lg">{session.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{session.wordCount}개 어휘</div>
                  </button>
                ))}
            </div>
          </div>
        )}

        {selectedSession && (
          <div>
            <div className="bg-card border border-border rounded-2xl p-4 mb-6">
              <div className="text-sm text-muted-foreground mb-2 font-bold">{getSessionDisplayName(selectedSession)}</div>
              {sessionLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 size={16} className="animate-spin" /> 세션 어휘를 불러오는 중...
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {sessionWords.map((word) => (
                    <span
                      key={word.id}
                      className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-bold"
                    >
                      {word.word}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <h2 className="text-2xl font-bold text-foreground mb-6">학습 단계를 선택하세요</h2>

            <div className="flex flex-col gap-4">
              {STEPS.map((step) => {
                const isCompleted = completedSteps.includes(step.id);
                return (
                  <button
                    key={step.id}
                    onClick={() => setCurrentStep(step.id)}
                    disabled={sessionLoading || sessionWords.length === 0}
                    className={`flex items-center gap-4 p-5 rounded-2xl border-2 transition-all text-left
                      ${isCompleted
                        ? "bg-success/10 border-success/30 hover:bg-success/20"
                        : "bg-card border-border hover:border-primary hover:bg-primary/5"}
                      ${sessionLoading || sessionWords.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold shrink-0
                        ${isCompleted ? "bg-success text-success-foreground" : "bg-primary text-primary-foreground"}`}
                    >
                      {isCompleted ? <CheckCircle size={24} /> : step.id}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-foreground text-lg">Step {step.id}. {step.name}</div>
                      <div className="text-sm text-muted-foreground">{step.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default LearningPage;
