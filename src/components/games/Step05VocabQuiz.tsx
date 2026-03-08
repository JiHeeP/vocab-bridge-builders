import React, { useState, useEffect, useRef } from 'react';
import { RotateCcw, CheckCircle, AlertCircle, HelpCircle, Trophy, ArrowRight, Lightbulb, Puzzle, Star, Play, Lock, Unlock } from 'lucide-react';
import { type VocabWord } from '@/lib/vocabData';
import type { WordStageScore } from '@/lib/scoreService';

interface Step05Props {
  words: VocabWord[];
  allWords: VocabWord[];
  onComplete: (scores?: WordStageScore[]) => void;
  onBack?: () => void;
}

const Step05VocabQuiz: React.FC<Step05Props> = ({ words, onComplete }) => {
  const [stage, setStage] = useState(1);
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0);
  const [gameState, setGameState] = useState<'playing' | 'transition' | 'complete'>('playing');
  const [grammarSelection, setGrammarSelection] = useState<string | null>(null);
  const [grammarFeedback, setGrammarFeedback] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [currentOptions, setCurrentOptions] = useState<string[]>([]);
  const [slots, setSlots] = useState<(string | null)[]>([]);
  const [bank, setBank] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string>('idle');
  const [lockedIndices, setLockedIndices] = useState<number[]>([]);
  const [removedDistractors, setRemovedDistractors] = useState<string[]>([]);
  const [hintsUsedCount, setHintsUsedCount] = useState(0);
  const [score, setScore] = useState(0);

  // Per-word score tracking
  const wordStartRef = useRef(Date.now());
  const stage1ScoresRef = useRef<Map<number, number>>(new Map()); // wordId → 0 or 1
  const stage2ScoresRef = useRef<Map<number, { score: number; timeSpent: number }>>(new Map());

  const problem = words[currentProblemIndex];

  useEffect(() => {
    if (gameState === 'playing' && problem) initializeProblem(currentProblemIndex, stage);
  }, [currentProblemIndex, stage, gameState]);

  const initializeProblem = (pIdx: number, currentStage: number) => {
    const p = words[pIdx];
    if (!p) return;
    wordStartRef.current = Date.now();
    if (currentStage === 1) {
      setGrammarSelection(null); setGrammarFeedback('idle');
      const correctChunk = p.l5.chunks[p.l5.targetIndex];
      const options = [correctChunk, p.l5.vocabDistractor].sort(() => Math.random() - 0.5);
      setCurrentOptions(options);
    } else {
      const allCards = [...p.l5.chunks, ...p.l5.fullDistractors].sort(() => Math.random() - 0.5);
      setBank(allCards);
      setSlots(new Array(p.l5.chunks.length).fill(null));
      setFeedback('idle'); setLockedIndices([]); setRemovedDistractors([]); setHintsUsedCount(0);
    }
  };

  const handleVocabCheck = (selectedOption: string) => {
    const correctOption = problem.l5.chunks[problem.l5.targetIndex];
    setGrammarSelection(selectedOption);
    if (selectedOption === correctOption) {
      setGrammarFeedback('correct'); setScore(prev => prev + 1);
      stage1ScoresRef.current.set(problem.id, 1);
      setTimeout(() => {
        if (currentProblemIndex < words.length - 1) setCurrentProblemIndex(prev => prev + 1);
        else setGameState('transition');
      }, 1000);
    } else {
      setGrammarFeedback('wrong');
      stage1ScoresRef.current.set(problem.id, 0);
      setTimeout(() => { setGrammarSelection(null); setGrammarFeedback('idle'); }, 1000);
    }
  };

  const handleBankClick = (card: string, bankIndex: number) => {
    if (feedback === 'correct') return;
    const emptySlotIndex = slots.findIndex(s => s === null);
    if (emptySlotIndex === -1) return;
    const newBank = [...bank]; newBank.splice(bankIndex, 1);
    const newSlots = [...slots]; newSlots[emptySlotIndex] = card;
    setBank(newBank); setSlots(newSlots); setFeedback('idle');
  };

  const handleSlotClick = (card: string, slotIndex: number) => {
    if (feedback === 'correct' || lockedIndices.includes(slotIndex)) return;
    const newSlots = [...slots]; newSlots[slotIndex] = null;
    setBank([...bank, card]); setSlots(newSlots); setFeedback('idle');
  };

  const checkAnswer = () => {
    if (slots.some(s => s === null)) return;
    const newLocked: number[] = []; const wrongIndices: number[] = [];
    slots.forEach((card, index) => {
      if (card === problem.l5.chunks[index]) newLocked.push(index);
      else wrongIndices.push(index);
    });
    if (wrongIndices.length === 0) {
      setFeedback('correct');
      const wordScore = hintsUsedCount === 0 ? 2 : 1;
      setScore(prev => prev + wordScore);
      const timeSpent = Math.round((Date.now() - wordStartRef.current) / 1000);
      stage2ScoresRef.current.set(problem.id, { score: wordScore, timeSpent });
      setTimeout(() => {
        if (currentProblemIndex < words.length - 1) setCurrentProblemIndex(prev => prev + 1);
        else setGameState('complete');
      }, 1500);
    } else {
      setFeedback('wrong');
      setLockedIndices([...lockedIndices, ...newLocked]);
      const cardsToReturn = wrongIndices.map(idx => slots[idx]!);
      const newSlots = [...slots]; wrongIndices.forEach(idx => newSlots[idx] = null);
      setTimeout(() => { setSlots(newSlots); setBank([...bank, ...cardsToReturn]); setFeedback('idle'); }, 800);
    }
  };

  const useHint = () => {
    const available = problem.l5.fullDistractors.filter(d => !removedDistractors.includes(d));
    if (available.length === 0) return;
    const target = available[0];
    if (bank.includes(target)) setBank(bank.filter(c => c !== target));
    setRemovedDistractors([...removedDistractors, target]); setHintsUsedCount(prev => prev + 1);
  };

  const buildFinalScores = (): WordStageScore[] => {
    return words.map(w => {
      const s1 = stage1ScoresRef.current.get(w.id) || 0;
      const s2Data = stage2ScoresRef.current.get(w.id);
      const s2 = s2Data?.score || 0;
      // Combine: s1 (0-1) + s2 (0-2), cap at 2
      const combined = Math.min(2, s1 + (s2 > 0 ? 1 : 0));
      return {
        wordId: w.id,
        wordText: w.word,
        score: combined,
        timeSpent: s2Data?.timeSpent || 0,
      };
    });
  };

  if (!problem) return null;

  const maxScore = words.length * 3;

  if (gameState === 'complete') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 font-body">
        <div className="bg-card p-8 rounded-3xl shadow-xl max-w-md w-full text-center border border-border animate-fade-in">
          <div className="flex justify-center mb-6"><div className="bg-warning/20 p-4 rounded-full animate-bounce"><Trophy className="w-20 h-20 text-warning" /></div></div>
          <h1 className="text-3xl font-extrabold text-foreground mb-2">모든 미션 클리어!</h1>
          <div className="bg-primary/10 p-6 rounded-2xl mb-8">
            <p className="text-sm text-primary font-bold mb-2">최종 점수</p>
            <div className="flex items-end justify-center gap-2"><span className="text-6xl font-black text-primary">{score}</span><span className="text-2xl font-bold text-primary/40 mb-3">/ {maxScore}</span></div>
          </div>
          <button onClick={() => onComplete(buildFinalScores())} className="w-full bg-success text-success-foreground font-bold py-4 rounded-2xl hover:bg-success/90 shadow-lg text-lg">다음 단계로</button>
        </div>
      </div>
    );
  }

  if (gameState === 'transition') {
    return (
      <div className="min-h-screen bg-primary flex flex-col items-center justify-center p-4 font-body text-primary-foreground">
        <div className="max-w-md w-full text-center animate-fade-in">
          <Star className="w-24 h-24 text-warning mx-auto mb-6" fill="currentColor" />
          <h1 className="text-4xl font-black mb-4">1단계 성공!</h1>
          <p className="text-xl text-primary-foreground/80 mb-10">단어의 뜻을 잘 알고 있네요.<br />이제 배운 단어로 <b>문장</b>을 만들어 볼까요?</p>
          <div className="bg-primary-foreground/10 p-6 rounded-2xl mb-10">
            <p className="text-primary-foreground/60 font-bold mb-2">현재 점수</p>
            <p className="text-5xl font-black">{score}점</p>
          </div>
          <button onClick={() => { setStage(2); setCurrentProblemIndex(0); setGameState('playing'); }}
            className="w-full bg-card text-primary font-bold py-5 rounded-2xl shadow-xl text-xl flex items-center justify-center gap-2 hover:bg-card/90"
          >
            2단계 시작하기 <Play fill="currentColor" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-body flex flex-col">
      <header className="bg-card border-b border-border px-4 py-3 sticky top-0 z-20 shadow-sm">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${stage === 1 ? 'bg-secondary/20' : 'bg-primary/10'}`}>
              <Puzzle size={20} className={stage === 1 ? 'text-secondary' : 'text-primary'} />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground">어휘의 징검다리 - Step 5</h1>
              <p className="text-xs text-muted-foreground font-medium">{stage === 1 ? 'Stage 1. 알맞은 말 고르기' : 'Stage 2. 문장 만들기'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1 bg-muted rounded-full text-xs font-bold text-muted-foreground">Score: {score}</div>
            <div className="text-xs font-bold text-primary">{currentProblemIndex + 1} / {words.length}</div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto p-4 flex flex-col">
        <div className="mt-4 mb-6 text-center">
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-4 ${stage === 1 ? 'bg-secondary/10 text-secondary' : 'bg-primary/10 text-primary'}`}>
            {stage === 1 ? <Lock size={12} /> : <Unlock size={12} />} {stage === 1 ? ' 낱말 퀴즈' : ' 핵심 어휘'}
          </div>
          <h2 className={`text-4xl font-black mb-3 tracking-tight ${stage === 1 ? 'text-muted tracking-widest' : 'text-foreground'}`}>
            {stage === 1 ? '?????' : problem.word}
          </h2>
          <p className={`font-medium text-lg break-keep ${stage === 1 ? 'text-foreground bg-secondary/10 p-4 rounded-xl border border-secondary/20' : 'text-muted-foreground'}`}>
            "{problem.meaning}"
          </p>
        </div>

        {stage === 1 && (
          <div className="flex-1 flex flex-col justify-center animate-fade-in">
            <div className="bg-card p-8 rounded-3xl shadow-sm border-2 border-border text-center mb-8">
              <div className="flex flex-wrap justify-center items-center gap-3 text-xl font-bold text-foreground leading-loose">
                {problem.l5.chunks.map((chunk, idx) => (
                  idx === problem.l5.targetIndex ? (
                    <div key={idx} className="w-32 h-10 border-b-4 border-secondary/30 bg-secondary/10 rounded mx-1 animate-pulse flex items-center justify-center text-secondary/30">
                      <HelpCircle size={20} />
                    </div>
                  ) : <span key={idx}>{chunk}</span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {currentOptions.map((option, idx) => (
                <button key={idx} onClick={() => handleVocabCheck(option)} disabled={grammarFeedback !== 'idle'}
                  className={`py-6 rounded-2xl text-xl font-bold shadow-sm border-2 transition-all
                    ${grammarSelection === option ? (grammarFeedback === 'correct' ? 'bg-success/10 border-success text-success' : 'bg-destructive/10 border-destructive text-destructive') : 'bg-card border-border text-foreground hover:border-secondary hover:bg-secondary/5'}`}
                >
                  {option}
                  {grammarSelection === option && grammarFeedback === 'correct' && <CheckCircle className="inline-block ml-2 w-6 h-6" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {stage === 2 && (
          <div className="flex flex-col flex-1 animate-fade-in">
            <div className="bg-card p-6 rounded-3xl shadow-sm border-2 border-border mb-6 relative min-h-[160px] flex flex-col justify-center">
              <button onClick={() => {
                const cardsToReturn: string[] = [];
                const newSlots = [...slots];
                newSlots.forEach((card, index) => { if (card && !lockedIndices.includes(index)) { cardsToReturn.push(card); newSlots[index] = null; } });
                if (cardsToReturn.length === 0) return;
                setSlots(newSlots); setBank([...bank, ...cardsToReturn]); setFeedback('idle');
              }} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground p-2 rounded-full hover:bg-muted transition-colors">
                <RotateCcw size={18} />
              </button>
              <div className="flex flex-wrap gap-2 justify-center items-center mt-4">
                {slots.map((card, index) => (
                  <div key={`slot-${index}`} className="relative group">
                    {!card && problem.l5.hints[index] && <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-muted-foreground/30 pointer-events-none select-none z-0">{problem.l5.hints[index]}</div>}
                    <button onClick={() => card && handleSlotClick(card, index)} disabled={lockedIndices.includes(index) || feedback === 'correct'}
                      className={`relative h-14 min-w-[90px] px-4 rounded-xl text-lg font-bold transition-all z-10 flex items-center justify-center border-2
                        ${card ? (lockedIndices.includes(index) ? 'bg-success/10 text-success border-success/20' : 'bg-card text-foreground border-primary/20 shadow-md -translate-y-[2px] hover:border-primary/30') : 'bg-muted/50 border-dashed border-border text-transparent hover:border-muted-foreground/30'}
                        ${feedback === 'wrong' && !lockedIndices.includes(index) && card ? 'animate-shake border-destructive/30 bg-destructive/10 text-destructive' : ''}`}
                    >
                      {card || "."}
                      {lockedIndices.includes(index) && <div className="absolute -top-2 -right-2 bg-card rounded-full p-0.5 shadow-sm border border-success/20"><CheckCircle size={14} className="text-success" /></div>}
                    </button>
                  </div>
                ))}
              </div>
              {feedback === 'correct' && <div className="absolute inset-x-0 -bottom-4 flex justify-center z-20"><div className="bg-success text-success-foreground px-5 py-2 rounded-full text-sm font-bold shadow-lg animate-bounce flex items-center gap-2"><CheckCircle size={18} /> 참 잘했어요!</div></div>}
              {feedback === 'wrong' && <div className="absolute inset-x-0 -bottom-4 flex justify-center z-20"><div className="bg-destructive text-destructive-foreground px-5 py-2 rounded-full text-sm font-bold shadow-lg animate-shake flex items-center gap-2"><AlertCircle size={18} /> 틀린 부분이 있어요</div></div>}
            </div>

            <div className="grid grid-cols-3 gap-3 mb-8">
              <button onClick={useHint} disabled={hintsUsedCount >= problem.l5.fullDistractors.length || feedback === 'correct'}
                className={`col-span-1 py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all border ${hintsUsedCount > 0 ? 'bg-muted text-muted-foreground border-border' : 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/20'}`}
              >
                <HelpCircle size={20} /> {hintsUsedCount > 0 ? '힌트 씀' : '함정 제거'}
              </button>
              <button onClick={checkAnswer} disabled={feedback === 'correct'}
                className={`col-span-2 py-3.5 rounded-2xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2
                  ${slots.some(s => s === null) ? 'bg-muted shadow-none cursor-not-allowed text-muted-foreground' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
              >
                정답 확인 <ArrowRight size={20} />
              </button>
            </div>

            <div className="flex flex-wrap justify-center gap-3 mb-4">
              {bank.map((card, idx) => (
                <button key={`bank-${idx}-${card}`} onClick={() => handleBankClick(card, idx)}
                  className="px-5 py-3 bg-card rounded-xl shadow-md border-2 border-border text-lg font-bold text-foreground hover:border-primary/30 hover:-translate-y-1 transition-all active:scale-95 touch-manipulation"
                >
                  {card}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Step05VocabQuiz;
