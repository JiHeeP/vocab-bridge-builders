import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import Step01Card from '@/components/games/Step01Card';
import Step02Matching from '@/components/games/Step02Matching';
import Step03RelatedWords from '@/components/games/Step03RelatedWords';
import Step04SyllableBlock from '@/components/games/Step04SyllableBlock';
import Step05VocabQuiz from '@/components/games/Step05VocabQuiz';
import Step06VocabShower from '@/components/games/Step06VocabShower';
import { loadVocabData, type VocabSet, type VocabWord } from '@/lib/vocabData';
import { getOrCreateStudent, saveLearningRecords, type StageScore, type WordStageScore } from '@/lib/scoreService';
import { toast } from '@/hooks/use-toast';
const STEPS = [
  { id: 1, name: '멀티모달 카드', desc: 'Form × Reception' },
  { id: 2, name: 'N+2 매칭 게임', desc: 'Form·Meaning × Reception' },
  { id: 3, name: '관련어 고르기', desc: 'Meaning × Reception' },
  { id: 4, name: '음절 블록 조립', desc: 'Form × Production' },
  { id: 5, name: '어휘 퀴즈 + 문장', desc: 'Meaning·Use × Production' },
  { id: 6, name: '어휘 소나기', desc: 'Meaning × Automatization' },
];

const LearningPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const studentName = searchParams.get('student') || '학생';

  const [loading, setLoading] = useState(true);
  const [sets, setSets] = useState<VocabSet[]>([]);
  const [allWords, setAllWords] = useState<VocabWord[]>([]);
  const [selectedSet, setSelectedSet] = useState<VocabSet | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [studentId, setStudentId] = useState<string | null>(null);

  // Score tracking: wordId → { wordText, stages: Map<stageNumber, StageScore> }
  const wordScoresRef = useRef<Map<number, { wordText: string; stages: Map<number, StageScore> }>>(new Map());

  useEffect(() => {
    Promise.all([
      loadVocabData(),
      getOrCreateStudent(studentName).catch(err => {
        console.error('Student lookup failed:', err);
        return null;
      }),
    ]).then(([{ words, sets }, sid]) => {
      setAllWords(words);
      setSets(sets);
      if (sid) setStudentId(sid);
      setLoading(false);
    });
  }, [studentName]);

  const handleStepComplete = async (scores?: WordStageScore[]) => {
    const step = currentStep;
    setCompletedSteps(prev => [...new Set([...prev, step])]);

    // Record scores for steps 2-5
    if (scores && step >= 2 && step <= 5) {
      for (const s of scores) {
        if (!wordScoresRef.current.has(s.wordId)) {
          wordScoresRef.current.set(s.wordId, { wordText: s.wordText, stages: new Map() });
        }
        wordScoresRef.current.get(s.wordId)!.stages.set(step, {
          stage: step,
          score: s.score,
          timeSpent: s.timeSpent,
        });
      }

      // Auto-save when step 3+ is completed (spec: 3단계 이상 완료 시 유효)
      const completedStageCount = new Set([...completedSteps, step].filter(s => s >= 2 && s <= 5)).size;
      if (completedStageCount >= 2 && studentId && selectedSet) {
        try {
          await saveLearningRecords(studentId, selectedSet.setIndex, wordScoresRef.current);
          toast({ title: '학습 기록 저장됨', description: `${completedStageCount}개 단계 완료` });
        } catch (err) {
          console.error('Save failed:', err);
        }
      }
    }

    if (currentStep < 6) {
      setCurrentStep(currentStep + 1);
    } else {
      setCurrentStep(0);
    }
  };

  const handleBack = () => setCurrentStep(0);


  const handleSetSelect = (set: VocabSet) => {
    setSelectedSet(set);
    wordScoresRef.current = new Map();
    setCompletedSteps([]);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground font-bold">어휘 데이터 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // Render active game
  if (selectedSet && currentStep >= 1 && currentStep <= 6) {
    const gameProps = {
      words: selectedSet.words,
      allWords,
      onComplete: handleStepComplete,
      onBack: handleBack,
    };

    if (currentStep === 1) return <Step01Card {...gameProps} />;
    if (currentStep === 2) return <Step02Matching {...gameProps} />;
    if (currentStep === 3) return <Step03RelatedWords {...gameProps} />;
    if (currentStep === 4) return <Step04SyllableBlock {...gameProps} />;
    if (currentStep === 5) return <Step05VocabQuiz {...gameProps} />;
    if (currentStep === 6) return <Step06VocabShower {...gameProps} />;
  }

  // Set selector
  if (!selectedSet) {
    return (
      <div className="min-h-screen bg-background font-body">
        <header className="bg-primary text-primary-foreground px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-primary-foreground/10 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-bold font-display">어휘의 징검다리</h1>
            <p className="text-sm opacity-80">{studentName} 학생</p>
          </div>
        </header>

        <main className="max-w-2xl mx-auto p-6">
          <h2 className="text-2xl font-bold text-foreground mb-2">학습 세트를 선택하세요</h2>
          <p className="text-muted-foreground mb-6">세트당 10개의 어휘를 학습합니다</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {sets.map((set) => (
              <button
                key={set.setIndex}
                onClick={() => handleSetSelect(set)}
                className="bg-card border-2 border-border hover:border-primary hover:bg-primary/5 rounded-2xl p-5 text-center transition-all active:scale-95 touch-manipulation shadow-sm hover:shadow-md"
              >
                <div className="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mx-auto mb-3">
                  {set.setIndex + 1}
                </div>
                <div className="font-bold text-foreground text-lg">{set.label}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {set.words.slice(0, 3).map(w => w.word).join(', ')}...
                </div>
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

  // Step selector
  return (
    <div className="min-h-screen bg-background font-body">
      <header className="bg-primary text-primary-foreground px-4 py-4 flex items-center gap-3">
        <button onClick={() => setSelectedSet(null)} className="p-2 rounded-lg hover:bg-primary-foreground/10 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-bold font-display">어휘의 징검다리</h1>
          <p className="text-sm opacity-80">{studentName} · {selectedSet.label}</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-6">
        <div className="bg-card border border-border rounded-2xl p-4 mb-6">
          <div className="text-sm text-muted-foreground mb-2 font-bold">{selectedSet.label} 어휘 목록</div>
          <div className="flex flex-wrap gap-2">
            {selectedSet.words.map(w => (
              <span key={w.id} className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-bold">
                {w.word}
              </span>
            ))}
          </div>
        </div>

        <h2 className="text-2xl font-bold text-foreground mb-6">학습 단계를 선택하세요</h2>

        <div className="flex flex-col gap-4">
          {STEPS.map((step) => {
            const isCompleted = completedSteps.includes(step.id);
            return (
              <button
                key={step.id}
                onClick={() => setCurrentStep(step.id)}
                className={`flex items-center gap-4 p-5 rounded-2xl border-2 transition-all text-left touch-manipulation active:scale-[0.98]
                  ${isCompleted
                    ? 'bg-success/10 border-success/30 hover:bg-success/20'
                    : 'bg-card border-border hover:border-primary hover:bg-primary/5'
                  }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold shrink-0
                  ${isCompleted ? 'bg-success text-success-foreground' : 'bg-primary text-primary-foreground'}`}>
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
      </main>
    </div>
  );
};

export default LearningPage;
