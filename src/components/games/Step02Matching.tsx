import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Hand } from 'lucide-react';
import { speak, playSound } from '@/lib/gameUtils';
import { type VocabWord, getWordEmoji, shuffle, pick } from '@/lib/vocabData';
import type { WordStageScore } from '@/lib/scoreService';

interface Step02MatchingProps {
  words: VocabWord[];
  allWords: VocabWord[];
  onComplete: (scores?: WordStageScore[]) => void;
  onBack?: () => void;
}

interface Round {
  targets: { id: string; word: string; emoji: string; hint: string; wordId: number }[];
  distractors: { id: string; word: string; hint: string }[];
}

interface Card {
  id: string;
  word: string;
  type: 'target' | 'distractor';
  emoji?: string;
  hint?: string;
}

function buildRounds(words: VocabWord[], allWords: VocabWord[]): Round[] {
  const rounds: Round[] = [];
  const wordsPerRound = 4;
  const distractorsPerRound = 2;
  const setWordNames = new Set(words.map(w => w.word));
  const otherWords = allWords.filter(w => !setWordNames.has(w.word));

  for (let i = 0; i < words.length; i += wordsPerRound) {
    const roundWords = words.slice(i, i + wordsPerRound);
    if (roundWords.length === 0) break;
    while (roundWords.length < wordsPerRound && i > 0) {
      const reviewIdx = Math.floor(Math.random() * Math.min(i, words.length));
      const reviewWord = words[reviewIdx];
      if (!roundWords.some(w => w.id === reviewWord.id)) roundWords.push(reviewWord);
      if (roundWords.length >= wordsPerRound) break;
    }

    const targets = roundWords.map((w, idx) => ({
      id: `t-${i}-${idx}`,
      word: w.word,
      wordId: w.id,
      emoji: getWordEmoji(w.word),
      hint: w.examples[0] ? w.examples[0].replace(w.word, '(  )') : `이것은 "${w.meaning}"입니다.`,
    }));

    const distractorWords = pick(otherWords, distractorsPerRound);
    const distractors = distractorWords.map((w, idx) => ({
      id: `d-${i}-${idx}`,
      word: w.word,
      hint: `"${w.word}"은(는) "${w.meaning}"이에요.`,
    }));

    rounds.push({ targets, distractors });
  }
  return rounds;
}

const Step02Matching: React.FC<Step02MatchingProps> = ({ words, allWords, onComplete }) => {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [cards, setCards] = useState<Card[]>([]);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [feedback, setFeedback] = useState({ type: 'info', msg: '카드를 끌어서 그림에 넣어보세요!' });
  const [shakeId, setShakeId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<'playing' | 'clearing' | 'round_end' | 'all_clear'>('playing');
  const [monsterEating, setMonsterEating] = useState(false);

  // Score tracking
  const startTimeRef = useRef(Date.now());
  const wrongAttemptsRef = useRef<Record<string, number>>({});
  const wordScoresRef = useRef<Map<string, { wordId: number; wrongAttempts: number }>>(new Map());

  useEffect(() => {
    const built = buildRounds(words, allWords);
    setRounds(built);
    startTimeRef.current = Date.now();
    if (built.length > 0) initRound(built, 0);
  }, [words, allWords]);

  const initRound = (roundList: Round[], idx: number) => {
    const round = roundList[idx];
    if (!round) return;
    const targetCards: Card[] = round.targets.map(t => ({ ...t, type: 'target' as const }));
    const distractorCards: Card[] = round.distractors.map(d => ({ ...d, type: 'distractor' as const }));
    const mixed = shuffle([...targetCards, ...distractorCards]);
    setCards(mixed);
    setMatches({});
    setSelectedCard(null);
    wrongAttemptsRef.current = {};
    setFeedback({ type: 'info', msg: '그림을 누르면 힌트 소리가 나와요.' });
    setGameState('playing');
  };

  const currentRound = rounds[currentRoundIdx];
  if (!currentRound) return null;

  const handleCorrect = (targetId: string, card: Card) => {
    playSound('correct');
    speak("맞아요! " + card.word);
    const newMatches = { ...matches, [targetId]: card.word };
    setMatches(newMatches);
    setCards(prev => prev.filter(c => c.id !== card.id));
    setSelectedCard(null);
    setFeedback({ type: 'success', msg: '참 잘했어요!' });

    // Track score
    const target = currentRound.targets.find(t => t.id === targetId);
    if (target) {
      const wrongs = wrongAttemptsRef.current[targetId] || 0;
      wordScoresRef.current.set(target.word, { wordId: target.wordId, wrongAttempts: wrongs });
    }

    if (Object.keys(newMatches).length === currentRound.targets.length) {
      setGameState('clearing');
      setFeedback({ type: 'warning', msg: '남은 카드는 몬스터에게 버려주세요!' });
      setTimeout(() => speak("와! 다 맞췄네요. 남은 가짜 카드는 몬스터에게 주세요."), 1000);
    }
  };

  const handleWrong = (targetId: string, card: Card) => {
    playSound('wrong');
    wrongAttemptsRef.current[targetId] = (wrongAttemptsRef.current[targetId] || 0) + 1;
    setShakeId(targetId);
    setTimeout(() => setShakeId(null), 500);
    if (card.type === 'distractor') {
      speak("비슷하지만 아니에요.");
      setFeedback({ type: 'error', msg: card.hint || "뜻이 조금 달라요." });
    } else {
      speak("그 그림이 아니에요.");
      setFeedback({ type: 'error', msg: "그 그림이 아니에요." });
    }
    setSelectedCard(null);
  };

  const handleMonsterEat = (card: Card) => {
    if (gameState !== 'clearing') return;
    if (card.type !== 'distractor') { speak("그건 정답 카드예요!"); return; }
    playSound('eat');
    setMonsterEating(true);
    setTimeout(() => setMonsterEating(false), 500);
    speak("꺼억!");
    const newCards = cards.filter(c => c.id !== card.id);
    setCards(newCards);
    setSelectedCard(null);
    if (newCards.length === 0) {
      setGameState('round_end');
      setFeedback({ type: 'success', msg: '완벽해요! 다음 단계로 갈까요?' });
      speak("완벽해요! 다음 단계로 출발!");
    }
  };

  const handleCardClick = (card: Card) => {
    if (gameState === 'clearing') { handleMonsterEat(card); return; }
    speak(card.word);
    setSelectedCard(card);
    setFeedback({ type: 'info', msg: '어디에 들어갈까요? 그림을 눌러보세요.' });
  };

  const handleSlotClick = (target: typeof currentRound.targets[0]) => {
    if (matches[target.id]) return;
    if (!selectedCard) {
      speak(target.hint);
      setFeedback({ type: 'info', msg: `힌트: ${target.hint}` });
      return;
    }
    if (selectedCard.word === target.word) handleCorrect(target.id, selectedCard);
    else handleWrong(target.id, selectedCard);
  };

  const buildFinalScores = (): WordStageScore[] => {
    const timePerWord = Math.round((Date.now() - startTimeRef.current) / 1000 / words.length);
    const scores: WordStageScore[] = [];
    for (const [wordText, data] of wordScoresRef.current) {
      scores.push({
        wordId: data.wordId,
        wordText,
        score: data.wrongAttempts === 0 ? 2 : 1,
        timeSpent: timePerWord,
      });
    }
    // Words not matched at all get 0
    for (const w of words) {
      if (!scores.some(s => s.wordId === w.id)) {
        scores.push({ wordId: w.id, wordText: w.word, score: 0, timeSpent: timePerWord });
      }
    }
    return scores;
  };

  const nextRound = () => {
    if (currentRoundIdx < rounds.length - 1) {
      const nextIdx = currentRoundIdx + 1;
      setCurrentRoundIdx(nextIdx);
      initRound(rounds, nextIdx);
    } else {
      setGameState('all_clear');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background font-body mx-auto shadow-xl overflow-hidden select-none max-w-3xl">
      <header className="bg-card p-3 shadow-sm z-10 flex justify-between items-center">
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <span className="text-2xl">🧩</span> 어휘의 징검다리
        </h1>
        <div className="text-sm font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full">
          Step 2: {currentRoundIdx + 1}/{rounds.length}
        </div>
      </header>

      <div className={`text-center text-sm font-medium py-2 transition-colors duration-300 shadow-inner px-2 min-h-[40px] flex items-center justify-center
        ${feedback.type === 'error' ? 'bg-destructive/10 text-destructive' :
          feedback.type === 'success' ? 'bg-success/10 text-success' :
          feedback.type === 'warning' ? 'bg-warning/10 text-warning' :
          'bg-muted text-muted-foreground'}`}>
        {feedback.msg}
      </div>

      <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
        <section className="flex-1 flex items-center justify-center w-full min-h-[200px]">
          {gameState === 'all_clear' ? (
            <div className="text-center animate-bounce">
              <h2 className="text-3xl font-bold text-primary mb-4">참 잘했어요! 🎉</h2>
              <p className="text-foreground">모든 라운드를 통과했습니다.</p>
              <button onClick={() => onComplete(buildFinalScores())}
                className="mt-6 bg-success text-success-foreground px-8 py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-success/90"
              >
                다음 단계로 출발! ✋
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2 w-full h-full max-h-[250px]">
              {currentRound.targets.map((target) => {
                const isMatched = matches[target.id];
                const isShaking = shakeId === target.id;
                return (
                  <div key={target.id} onClick={() => handleSlotClick(target)}
                    className={`relative flex flex-col items-center justify-center rounded-xl border-4 transition-all duration-200
                      ${isMatched ? 'bg-primary/10 border-primary shadow-inner' : 'bg-card border-border hover:border-primary/30 shadow-md'}
                      ${isShaking ? 'animate-shake border-destructive bg-destructive/10' : ''}
                      cursor-pointer active:scale-95 touch-manipulation`}
                  >
                    <span className={`text-5xl mb-2 transition-all ${isMatched ? 'scale-110' : ''}`}>{target.emoji}</span>
                    {isMatched ? (
                      <span className="text-lg sm:text-xl font-bold text-primary animate-pop-in break-keep text-center leading-tight">{isMatched}</span>
                    ) : (
                      <div className="flex flex-col items-center">
                        <div className="w-12 h-8 sm:w-16 border-2 border-dashed border-muted rounded flex items-center justify-center mb-1">
                          <span className="text-muted-foreground text-[10px] sm:text-xs">여기</span>
                        </div>
                        <Volume2 size={14} className="text-muted-foreground animate-pulse" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className={`h-20 sm:h-24 w-full transition-all duration-500 flex justify-center items-center ${(gameState === 'clearing' || gameState === 'round_end') ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
          {gameState === 'clearing' && (
            <div className={`w-full max-w-sm h-full bg-secondary/10 rounded-2xl border-4 border-dashed border-secondary/40 flex items-center justify-center gap-4 cursor-pointer hover:bg-secondary/20 transition-all ${monsterEating ? 'scale-90 bg-secondary/30' : 'animate-bounce-slight'}`}>
              <div className="text-4xl transition-transform duration-200" style={{ transform: monsterEating ? 'scale(1.5) rotate(10deg)' : 'scale(1)' }}>
                {monsterEating ? '😋' : '👹'}
              </div>
              <div className="flex flex-col text-secondary">
                <span className="font-bold text-lg">가짜 단어 먹기</span>
                <span className="text-xs">카드를 터치하세요!</span>
              </div>
            </div>
          )}
          {gameState === 'round_end' && (
            <button onClick={nextRound}
              className="w-full max-w-sm h-16 bg-primary text-primary-foreground rounded-2xl text-xl font-bold shadow-lg animate-pulse hover:bg-primary/90 flex items-center justify-center gap-2"
            >
              다음 단계로 출발! <Hand className="rotate-90" />
            </button>
          )}
        </section>

        <section className="bg-card p-4 rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.1)] min-h-[160px]">
          <div className="flex flex-wrap justify-center gap-3">
            {gameState !== 'all_clear' && gameState !== 'round_end' && cards.map((card) => {
              const isSelected = selectedCard && selectedCard.id === card.id;
              return (
                <div key={card.id} onClick={() => handleCardClick(card)}
                  className={`px-4 py-3 sm:px-6 sm:py-4 rounded-xl shadow-md text-lg sm:text-xl font-bold border-b-4 transition-all duration-200 cursor-pointer select-none touch-manipulation
                    ${isSelected ? 'bg-primary text-primary-foreground border-primary/80 -translate-y-2 ring-2 ring-primary/30' : 'bg-card text-foreground border-border hover:-translate-y-1 hover:border-primary/40'}`}
                >
                  {card.word}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
};

export default Step02Matching;
