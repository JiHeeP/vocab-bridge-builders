import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Volume2, HelpCircle, CheckCircle, AlertCircle, Play, RotateCcw } from 'lucide-react';
import { speak } from '@/lib/gameUtils';
import { type VocabWord, getWordEmoji, shuffle } from '@/lib/vocabData';
import type { WordStageScore } from '@/lib/scoreService';

interface Block { char: string; id: string; status: 'idle' | 'used'; }

interface Step04Props {
  words: VocabWord[];
  allWords: VocabWord[];
  onComplete: (scores?: WordStageScore[]) => void;
  onBack?: () => void;
}

const Step04SyllableBlock: React.FC<Step04Props> = ({ words, onComplete }) => {
  const [currentStage, setCurrentStage] = useState(0);
  const [difficulty, setDifficulty] = useState<'easy' | 'hard'>('hard');
  const [currentSlots, setCurrentSlots] = useState<(Block | null)[]>([]);
  const [shuffledBlocks, setShuffledBlocks] = useState<Block[]>([]);
  const [feedback, setFeedback] = useState({ type: '', msg: '' });
  const [isComplete, setIsComplete] = useState(false);
  const [isIncorrect, setIsIncorrect] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [shakeSlots, setShakeSlots] = useState(false);

  // Score tracking
  const wordStartRef = useRef(Date.now());
  const attemptsRef = useRef(0);
  const hintUsedRef = useRef(false);
  const scoresRef = useRef<WordStageScore[]>([]);

  const currentWord = words[currentStage];

  const getL4Data = useCallback((word: VocabWord) => {
    const answer = word.l4.answer || word.word;
    const allOptions = word.l4.options;
    const answerSyllables = answer.split('');
    const distractors = allOptions.filter(s => !answerSyllables.includes(s));
    return { answer, syllables: answerSyllables, distractors };
  }, []);

  const getSentenceParts = useCallback((word: VocabWord) => {
    const example = word.examples[0] || `${word.word}을(를) 배웠다.`;
    const wordIdx = example.indexOf(word.word);
    if (wordIdx === -1) return { pre: '', post: example, target: word.word };
    return { pre: example.substring(0, wordIdx), post: example.substring(wordIdx + word.word.length), target: word.word };
  }, []);

  const initStage = useCallback(() => {
    const word = words[currentStage];
    if (!word) return;
    const l4 = getL4Data(word);
    setCurrentSlots(Array(l4.syllables.length).fill(null));
    let blocks = [...l4.syllables];
    if (difficulty === 'hard') blocks = [...blocks, ...l4.distractors];
    setShuffledBlocks(shuffle(blocks).map((char, idx) => ({ char, id: `block-${idx}`, status: 'idle' })));
    setFeedback({ type: 'info', msg: difficulty === 'easy' ? '흐린 글자를 따라 블록을 넣어보세요.' : '문장을 완성해 보세요.' });
    setIsComplete(false); setIsIncorrect(false); setShowHint(false); setShakeSlots(false);
    wordStartRef.current = Date.now();
    attemptsRef.current = 0;
    hintUsedRef.current = false;
    const sentence = getSentenceParts(word);
    setTimeout(() => speak(`${sentence.pre} 무엇, ${sentence.post}`), 500);
  }, [currentStage, difficulty, words, getL4Data, getSentenceParts]);

  useEffect(() => { initStage(); }, [initStage]);

  const recordScore = () => {
    const timeSpent = Math.round((Date.now() - wordStartRef.current) / 1000);
    let score: number;
    if (attemptsRef.current === 0 && !hintUsedRef.current) {
      score = 2; // First try, no hint
    } else if (attemptsRef.current <= 1 || hintUsedRef.current) {
      score = 1; // Hint or one retry
    } else {
      score = 0; // Multiple retries
    }
    scoresRef.current.push({
      wordId: currentWord.id,
      wordText: currentWord.word,
      score,
      timeSpent,
    });
  };

  const handleBlockClick = (block: Block) => {
    if (isComplete || isIncorrect) return;
    const l4 = getL4Data(currentWord);
    const emptySlotIndex = currentSlots.findIndex(slot => slot === null);
    if (emptySlotIndex === -1) return;
    const newSlots = [...currentSlots];
    newSlots[emptySlotIndex] = block;
    setCurrentSlots(newSlots);
    setShuffledBlocks(prev => prev.map(b => b.id === block.id ? { ...b, status: 'used' } : b));
    speak(block.char);
    if (emptySlotIndex === l4.syllables.length - 1) {
      const formedWord = newSlots.map(s => s!.char).join('');
      if (formedWord === l4.answer) {
        setIsComplete(true);
        setFeedback({ type: 'complete', msg: '참 잘했어요! 문장이 완성되었어요.' });
        recordScore();
        const sentence = getSentenceParts(currentWord);
        setTimeout(() => speak(`${sentence.pre} ${l4.answer}, ${sentence.post}`), 800);
      } else {
        attemptsRef.current += 1;
        setIsIncorrect(true);
        setFeedback({ type: 'error', msg: '틀렸습니다. 다시 시도해 보세요.' });
        speak("틀렸습니다. 다시 해보세요.");
        setShakeSlots(true);
        setTimeout(() => setShakeSlots(false), 500);
      }
    }
  };

  const handleSlotClick = (index: number) => {
    if (isIncorrect || isComplete || !currentSlots[index]) return;
    const blockToReturn = currentSlots[index]!;
    const newSlots = [...currentSlots];
    newSlots[index] = null;
    setCurrentSlots(newSlots);
    setShuffledBlocks(prev => prev.map(b => b.id === blockToReturn.id ? { ...b, status: 'idle' } : b));
  };

  const handleShowHint = () => {
    hintUsedRef.current = true;
    setShowHint(true);
  };

  const nextStage = () => {
    if (currentStage < words.length - 1) setCurrentStage(prev => prev + 1);
    else onComplete([...scoresRef.current]);
  };

  const handleRetry = () => {
    attemptsRef.current += 1;
    initStage();
  };

  if (!currentWord) return null;

  const l4 = getL4Data(currentWord);
  const sentence = getSentenceParts(currentWord);
  const emoji = getWordEmoji(currentWord.word);

  return (
    <div className="min-h-screen bg-background font-body flex flex-col items-center p-4">
      <header className="w-full max-w-2xl flex justify-between items-center mb-6 bg-card p-4 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold">{currentStage + 1}</div>
          <span className="text-muted-foreground text-sm">/ {words.length}</span>
        </div>
        <h1 className="text-lg font-bold text-foreground">어휘의 징검다리 - Step 4</h1>
        <button onClick={() => setDifficulty(d => d === 'easy' ? 'hard' : 'easy')}
          className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${difficulty === 'easy' ? 'bg-success/20 text-success ring-2 ring-success' : 'bg-destructive/20 text-destructive ring-2 ring-destructive'}`}
        >
          {difficulty === 'easy' ? 'EASY 모드' : 'HARD 모드'}
        </button>
      </header>

      <main className="w-full max-w-2xl flex-1 flex flex-col gap-6">
        <div className="bg-card rounded-3xl p-6 shadow-md flex flex-col items-center gap-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-primary" />
          <button onClick={handleShowHint} className="absolute top-4 right-4 text-muted-foreground hover:text-primary transition-colors"><HelpCircle size={24} /></button>
          <div className="w-32 h-32 bg-primary/10 rounded-full flex items-center justify-center text-6xl shadow-inner mb-2 border-4 border-card">{emoji}</div>
          <div className="flex flex-wrap justify-center items-end gap-2 text-xl md:text-2xl font-medium text-foreground leading-relaxed text-center">
            <span>{sentence.pre}</span>
            <div className={`flex gap-1 mx-1 ${shakeSlots ? 'animate-bounce' : ''}`}>
              {l4.syllables.map((char, idx) => (
                <div key={idx} onClick={() => handleSlotClick(idx)}
                  className={`w-12 h-14 md:w-16 md:h-20 rounded-xl flex items-center justify-center text-2xl font-bold cursor-pointer transition-all border-b-4 relative
                    ${currentSlots[idx] ? (isIncorrect ? 'bg-destructive/10 border-destructive/30 text-destructive' : 'bg-primary text-primary-foreground border-primary/70 shadow-lg') : 'bg-muted border-border'}`}
                >
                  {currentSlots[idx] ? currentSlots[idx]!.char : (difficulty === 'easy' ? <span className="text-muted-foreground/30">{char}</span> : '')}
                </div>
              ))}
            </div>
            <span>{sentence.post}</span>
          </div>
          <div className={`h-8 flex items-center gap-2 text-sm font-bold transition-all ${feedback.type === 'error' ? 'text-destructive' : feedback.type === 'complete' ? 'text-success' : 'text-muted-foreground'}`}>
            {feedback.type === 'error' && <AlertCircle size={16} />}
            {feedback.type === 'complete' && <CheckCircle size={16} />}
            {feedback.msg}
          </div>
        </div>

        <div className="flex-1 bg-card/50 backdrop-blur-sm rounded-3xl p-6 border-2 border-dashed border-primary/20 flex flex-col items-center justify-center relative min-h-[200px]">
          {isIncorrect ? (
            <div className="text-center animate-fade-in">
              <div className="text-4xl mb-2">🤔</div>
              <h3 className="text-lg font-bold text-muted-foreground mb-4">다시 한번 생각해 볼까요?</h3>
              <button onClick={handleRetry} className="px-6 py-3 bg-destructive text-destructive-foreground rounded-full text-lg font-bold shadow-lg hover:bg-destructive/90 flex items-center gap-2 mx-auto">
                <RotateCcw size={20} /> 다시 풀기
              </button>
            </div>
          ) : isComplete ? (
            <div className="text-center animate-pulse">
              <div className="text-4xl mb-4">🎉</div>
              <h3 className="text-xl font-bold text-primary mb-6">참 잘했어요!</h3>
              <button onClick={nextStage} className="px-8 py-3 bg-primary text-primary-foreground rounded-full text-lg font-bold shadow-lg hover:bg-primary/90 flex items-center gap-2 mx-auto">
                다음 문제 <Play size={20} fill="currentColor" />
              </button>
            </div>
          ) : (
            <>
              <p className="text-muted-foreground mb-4 text-sm font-medium">
                {difficulty === 'hard' ? '알맞은 글자를 골라 빈칸을 채우세요.' : '흐린 글자를 보고 똑같은 블록을 찾아보세요.'}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {shuffledBlocks.map(block => {
                  if (block.status === 'used') return null;
                  return (
                    <button key={block.id} onClick={() => handleBlockClick(block)}
                      className="w-14 h-14 md:w-16 md:h-16 bg-card rounded-2xl shadow-md border-2 border-primary/10 text-xl font-bold text-foreground hover:bg-primary/5 hover:border-primary/30 hover:scale-105 active:scale-95 transition-all"
                    >
                      {block.char}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </main>

      {showHint && (
        <div className="fixed inset-0 bg-foreground/40 flex items-center justify-center z-50 p-4" onClick={() => setShowHint(false)}>
          <div className="bg-card rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground mb-2 border-b border-border pb-2">도움말</h3>
            <div className="flex flex-col items-center gap-4 mb-4">
              <div className="text-6xl bg-primary/10 p-4 rounded-2xl border-2 border-primary/10 shadow-sm">{emoji}</div>
              <p className="text-lg font-bold text-foreground leading-snug break-keep bg-warning/10 p-3 rounded-xl border border-warning/20">{currentWord.meaning}</p>
            </div>
            <button onClick={() => setShowHint(false)} className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 shadow-md">닫기</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Step04SyllableBlock;
