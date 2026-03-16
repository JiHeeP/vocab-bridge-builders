import React, { useEffect, useMemo, useState, useRef } from 'react';
import { ArrowRight, CheckCircle2, HelpCircle, Lightbulb, RefreshCcw, Trophy } from 'lucide-react';
import { speak } from '@/lib/gameUtils';
import { type VocabWord, generateBadWords, shuffle, pick } from '@/lib/vocabData';
import type { WordStageScore } from '@/lib/scoreService';

const REQUIRED_COUNT = 4;

interface Option { id: string; text: string; isGood: boolean; }

interface Step03Props {
  words: VocabWord[];
  allWords: VocabWord[];
  onComplete: (scores?: WordStageScore[]) => void;
  onBack?: () => void;
}

function buildOptions(word: VocabWord, allWords: VocabWord[]): Option[] {
  let goodPool = [...word.relatedWords];

  // Supplement if fewer than REQUIRED_COUNT related words
  if (goodPool.length < REQUIRED_COUNT) {
    const supplementPool = allWords
      .filter(w => w.word !== word.word)
      .flatMap(w => w.relatedWords)
      .filter(rw => !goodPool.includes(rw) && rw !== word.word);
    const needed = REQUIRED_COUNT - goodPool.length;
    goodPool = [...goodPool, ...shuffle(supplementPool).slice(0, needed)];
  }

  const goodWords = pick(goodPool, REQUIRED_COUNT);
  const badWords = generateBadWords(word, allWords, REQUIRED_COUNT);
  const good = goodWords.map((text, idx) => ({ id: `g-${word.word}-${idx}`, text, isGood: true }));
  const bad = badWords.map((text, idx) => ({ id: `b-${word.word}-${idx}`, text, isGood: false }));
  return shuffle([...good, ...bad]);
}

const Step03RelatedWords: React.FC<Step03Props> = ({ words, allWords, onComplete }) => {
  const [index, setIndex] = useState(0);
  const [options, setOptions] = useState<Option[]>([]);
  const [selectedMap, setSelectedMap] = useState<Record<string, boolean>>({});
  const [lockedMap, setLockedMap] = useState<Record<string, boolean>>({});
  const [hintUsed, setHintUsed] = useState(false);
  const [retryUsed, setRetryUsed] = useState(false);
  const [roundState, setRoundState] = useState<'playing' | 'resolved'>('playing');
  const [pendingResult, setPendingResult] = useState<any>(null);
  const [totalScore, setTotalScore] = useState(0);
  const [results, setResults] = useState<{ word: string; wordId: number; score: number }[]>([]);
  const [feedback, setFeedback] = useState({ type: 'info', msg: '관련된 단어 4개를 고르세요.' });
  const [isComplete, setIsComplete] = useState(false);
  const startTimeRef = useRef(Date.now());
  const wordStartRef = useRef(Date.now());

  const topic = words[index];
  const maxScore = words.length * 2;

  useEffect(() => {
    if (!words[index]) return;
    setOptions(buildOptions(words[index], allWords));
    setSelectedMap({}); setLockedMap({}); setHintUsed(false); setRetryUsed(false);
    setRoundState('playing'); setPendingResult(null);
    setFeedback({ type: 'info', msg: `관련된 단어를 고르세요.` });
    wordStartRef.current = Date.now();
  }, [index, words, allWords]);

  const selectedCount = useMemo(() => Object.values(selectedMap).filter(Boolean).length, [selectedMap]);

  const toggleOption = (option: Option) => {
    if (roundState !== 'playing' || lockedMap[option.id]) return;
    const isSelected = !!selectedMap[option.id];
    if (!isSelected && selectedCount >= actualGoodCount) { setFeedback({ type: 'error', msg: `최대 ${actualGoodCount}개까지만 선택할 수 있어요.` }); return; }
    setSelectedMap(prev => ({ ...prev, [option.id]: !isSelected }));
  };

  const handleHint = () => {
    if (roundState !== 'playing' || hintUsed) return;
    const candidate = options.find(o => o.isGood && !selectedMap[o.id]);
    if (!candidate) return;
    setHintUsed(true);
    setSelectedMap(prev => ({ ...prev, [candidate.id]: true }));
    setLockedMap(prev => ({ ...prev, [candidate.id]: true }));
    setFeedback({ type: 'warning', msg: `힌트 사용: "${candidate.text}"는 정답입니다. (이번 문제 최대 1점)` });
  };

  const handleReset = () => {
    if (roundState !== 'playing') return;
    const lockedSelected: Record<string, boolean> = {};
    Object.keys(lockedMap).forEach(id => { if (lockedMap[id]) lockedSelected[id] = true; });
    setSelectedMap(lockedSelected);
    setFeedback({ type: 'info', msg: '선택을 초기화했습니다.' });
  };

  const resolveRound = (score: number) => {
    const timeSpent = Math.round((Date.now() - wordStartRef.current) / 1000);
    setPendingResult({ word: topic.word, wordId: topic.id, score, hintUsed, attempts: retryUsed ? 2 : 1, timeSpent });
    setRoundState('resolved');
  };

  const actualGoodCount = useMemo(() => options.filter(o => o.isGood).length, [options]);

  const handleCheck = () => {
    if (roundState !== 'playing' || selectedCount !== actualGoodCount) {
      setFeedback({ type: 'error', msg: `정확히 ${actualGoodCount}개를 선택한 뒤 채점하세요.` }); return;
    }
    const selected = options.filter(o => selectedMap[o.id]);
    const isCorrect = selected.length === actualGoodCount && selected.every(o => o.isGood);
    if (isCorrect) {
      const score = hintUsed ? 1 : 2;
      setFeedback({ type: 'success', msg: `정답입니다! 이번 문제 ${score}점` });
      resolveRound(score); return;
    }
    if (!retryUsed) { setRetryUsed(true); setFeedback({ type: 'error', msg: '오답입니다. 재시도 1회가 남아 있어요.' }); return; }
    setFeedback({ type: 'error', msg: '오답입니다. 이번 문제는 0점으로 넘어갑니다.' });
    resolveRound(0);
  };

  const goNext = () => {
    if (!pendingResult) return;
    setResults(prev => [...prev, { word: pendingResult.word, wordId: pendingResult.wordId, score: pendingResult.score }]);
    setTotalScore(prev => prev + pendingResult.score);
    if (index >= words.length - 1) { setIsComplete(true); return; }
    setIndex(prev => prev + 1);
  };

  if (isComplete) {
    const allResults = [...results];
    if (pendingResult && !results.some(r => r.wordId === pendingResult.wordId)) {
      allResults.push({ word: pendingResult.word, wordId: pendingResult.wordId, score: pendingResult.score });
    }
    const defaultTime = Math.round((Date.now() - startTimeRef.current) / 1000 / words.length);
    const allScores: WordStageScore[] = allResults.map(r => ({
      wordId: r.wordId,
      wordText: r.word,
      score: r.score,
      timeSpent: defaultTime,
    }));

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 font-body">
        <div className="w-full max-w-lg bg-card rounded-3xl shadow-xl border border-border p-8 text-center">
          <div className="mx-auto mb-5 w-24 h-24 rounded-full bg-warning/20 flex items-center justify-center">
            <Trophy className="w-12 h-12 text-warning" />
          </div>
          <h1 className="text-3xl font-black text-foreground mb-2">Step 3 완료</h1>
          <div className="bg-primary/10 rounded-2xl p-6 mb-6">
            <div className="text-sm text-primary font-bold mb-2">최종 점수</div>
            <div className="text-5xl font-black text-primary">{totalScore + (pendingResult?.score || 0)} / {maxScore}</div>
          </div>
          <button onClick={() => onComplete(allScores)} className="w-full bg-success text-success-foreground py-4 rounded-2xl font-bold hover:bg-success/90 flex items-center justify-center gap-2">
            다음 단계로 <ArrowRight size={18} />
          </button>
        </div>
      </div>
    );
  }

  if (!topic) return null;

  const feedbackColor = feedback.type === 'success' ? 'text-success bg-success/10' : feedback.type === 'error' ? 'text-destructive bg-destructive/10' : feedback.type === 'warning' ? 'text-warning bg-warning/10' : 'text-muted-foreground bg-muted';

  return (
    <div className="min-h-screen bg-background font-body">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-foreground">어휘의 징검다리 - Step 3</h1>
            <p className="text-xs text-muted-foreground">관련어 고르기</p>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold text-foreground">{index + 1} / {words.length}</div>
            <div className="text-xs text-muted-foreground">점수: {totalScore}</div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 md:p-6">
        <section className="bg-card border border-border rounded-3xl p-6 mb-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-bold text-primary mb-1">핵심 단어</div>
              <div className="text-4xl font-black text-foreground">{topic.word}</div>
            </div>
            <button onClick={() => speak(topic.word)} className="px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-bold hover:bg-primary/20">단어 듣기</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {options.map(option => {
              const isSelected = !!selectedMap[option.id];
              const isLocked = !!lockedMap[option.id];
              return (
                <button key={option.id} onClick={() => toggleOption(option)} disabled={roundState !== 'playing'}
                  className={`h-14 rounded-xl font-bold border-2 transition-all ${isSelected ? 'bg-primary text-primary-foreground border-primary shadow-md' : 'bg-card text-foreground border-border hover:border-primary/30'} ${isLocked ? 'ring-2 ring-warning' : ''}`}
                >
                  {option.text}
                </button>
              );
            })}
          </div>
          <div className="mt-5 text-xs text-muted-foreground">선택: <b>{selectedCount}</b> / {actualGoodCount}</div>
        </section>

        <section className="bg-card border border-border rounded-3xl p-5 mb-5">
          <div className={`rounded-xl px-4 py-3 text-sm font-bold ${feedbackColor}`}>{feedback.msg}</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
            <button onClick={handleHint} disabled={hintUsed || roundState !== 'playing'}
              className={`py-3 rounded-xl font-bold border flex items-center justify-center gap-2 ${hintUsed || roundState !== 'playing' ? 'bg-muted text-muted-foreground border-border' : 'bg-warning/10 text-warning border-warning/30 hover:bg-warning/20'}`}
            >
              <Lightbulb size={16} /> {hintUsed ? '힌트 사용됨' : '힌트 1회'}
            </button>
            <button onClick={handleReset} disabled={roundState !== 'playing'}
              className={`py-3 rounded-xl font-bold border flex items-center justify-center gap-2 ${roundState !== 'playing' ? 'bg-muted text-muted-foreground border-border' : 'bg-muted text-foreground border-border hover:bg-muted/80'}`}
            >
              <RefreshCcw size={16} /> 선택 초기화
            </button>
            <button onClick={handleCheck} disabled={roundState !== 'playing'}
              className={`py-3 rounded-xl font-bold border md:col-span-2 flex items-center justify-center gap-2 ${roundState !== 'playing' ? 'bg-muted text-muted-foreground border-border' : 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'}`}
            >
              {retryUsed ? <HelpCircle size={16} /> : <CheckCircle2 size={16} />}
              {retryUsed ? '재시도 채점' : '채점하기'}
            </button>
          </div>
          {roundState === 'resolved' && pendingResult && (
            <button onClick={goNext} className="w-full mt-4 py-3 rounded-xl bg-success text-success-foreground font-bold hover:bg-success/90 flex items-center justify-center gap-2">
              다음 문제로 이동 <ArrowRight size={16} />
            </button>
          )}
        </section>
      </main>
    </div>
  );
};

export default Step03RelatedWords;
