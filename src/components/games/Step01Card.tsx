import React, { useState, useEffect } from 'react';
import { Volume2, RotateCcw, CheckCircle, HelpCircle, ArrowRight, Quote, Image as ImageIcon, Hand } from 'lucide-react';
import { speak } from '@/lib/gameUtils';
import { type VocabWord, getWordEmoji, getWordColor } from '@/lib/vocabData';
import { getWordImages, type WordImage } from '@/lib/wordImageService';

interface Step01CardProps {
  words: VocabWord[];
  allWords: VocabWord[];
  onComplete: () => void;
  onBack?: () => void;
}

const Step01Card: React.FC<Step01CardProps> = ({ words, onComplete, onBack }) => {
  const [deck, setDeck] = useState<VocabWord[]>([]);
  const [unknownDeck, setUnknownDeck] = useState<VocabWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [started, setStarted] = useState(false);
  const [wordImages, setWordImages] = useState<Map<string, WordImage>>(new Map());

  useEffect(() => {
    setDeck([...words]);
    setUnknownDeck([]);
    setCurrentIndex(0);
    setIsFlipped(false);
    setStarted(true);

    // Load images
    getWordImages(words.map(w => w.word)).then(setWordImages);
  }, [words]);

  useEffect(() => {
    if (started && deck.length > 0 && currentIndex < deck.length) {
      const currentWord = deck[currentIndex];
      if (!isFlipped) {
        speak(currentWord.word, 0.7);
      } else {
        const text = `${currentWord.word}. ${currentWord.meaning}. 예문. ${currentWord.examples[0] || ''}`;
        speak(text, 0.85);
      }
    }
  }, [currentIndex, isFlipped, started, deck]);

  const handleFlip = () => setIsFlipped(!isFlipped);

  const handleRate = (isKnown: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentWord = deck[currentIndex];
    if (!isKnown && !unknownDeck.some(w => w.id === currentWord.id)) {
      setUnknownDeck(prev => [...prev, currentWord]);
    }
    if (currentIndex < deck.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
    } else {
      setShowModal(true);
    }
  };

  const handleRetry = () => {
    setDeck([...unknownDeck]);
    setUnknownDeck([]);
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowModal(false);
  };

  if (!started || deck.length === 0) return null;

  const currentWord = deck[currentIndex];
  const progressPercent = ((currentIndex + 1) / deck.length) * 100;
  const emoji = getWordEmoji(currentWord.word);
  const color = getWordColor(currentIndex);
  const wordImage = wordImages.get(currentWord.word);

  const renderImage = (size: 'large' | 'small') => {
    const isLarge = size === 'large';
    const containerClass = isLarge
      ? "w-64 h-64 rounded-2xl mb-8"
      : "w-32 h-32 rounded-2xl";

    if (wordImage) {
      return (
        <div className={`${containerClass} overflow-hidden shadow-inner border-2 border-primary/10 relative`}>
          <img
            src={wordImage.image_url}
            alt={currentWord.word}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {wordImage.photographer_name && (
            <a
              href={`${wordImage.unsplash_url}?utm_source=vocab_app&utm_medium=referral`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-1 right-1 text-[9px] text-white/70 bg-black/40 px-1.5 py-0.5 rounded hover:text-white/90 transition-colors"
            >
              📷 {wordImage.photographer_name}
            </a>
          )}
        </div>
      );
    }

    return (
      <div
        className={`${containerClass} flex items-center justify-center border-2 border-primary/10 shadow-inner`}
        style={{ backgroundColor: `#${color}` }}
      >
        <span className={isLarge ? "text-[120px]" : "text-6xl"}>{emoji}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 font-body text-foreground">
      {/* Header */}
      <div className="w-full max-w-md mb-6">
        <div className="flex justify-between items-end mb-2 px-2">
          <span className="text-lg font-bold text-foreground">학습 진행중</span>
          <span className="text-primary font-bold">{currentIndex + 1} / {deck.length}</span>
        </div>
        <div className="w-full bg-muted rounded-full h-3">
          <div className="bg-primary h-3 rounded-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-md h-[600px] relative perspective-1000">
        <div onClick={handleFlip}
          className="relative w-full h-full bg-card rounded-3xl shadow-xl border border-border cursor-pointer overflow-hidden transition-all duration-300 hover:shadow-2xl"
        >
          {!isFlipped && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-card animate-fade-in">
              <div className="absolute top-6 right-6 text-muted-foreground text-sm font-bold flex items-center gap-1 animate-pulse">
                <Hand size={16} /> 터치해서 뒤집기
              </div>
              {renderImage('large')}
              <h2 className="text-6xl font-black text-foreground mb-8 tracking-tight">{currentWord.word}</h2>
              <div className="flex items-center gap-2 text-primary font-bold bg-primary/10 px-6 py-3 rounded-full shadow-sm">
                <Volume2 size={24} />
                <span className="text-lg">소리 듣기</span>
              </div>
            </div>
          )}

          {isFlipped && (
            <div className="absolute inset-0 flex flex-col p-6 bg-background animate-fade-in">
              <div className="w-full flex justify-end mb-2">
                <div className="text-muted-foreground text-sm font-bold flex items-center gap-1">
                  <RotateCcw size={14} /> 앞면 보기
                </div>
              </div>
              <div className="flex-1 flex flex-col items-center w-full overflow-y-auto no-scrollbar">
                <div className="flex flex-col items-center justify-center w-full mb-4 mt-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-4xl font-bold text-foreground">{currentWord.word}</h3>
                    <button onClick={(e) => { e.stopPropagation(); speak(currentWord.word, 0.7); }}
                      className="text-primary hover:text-primary/80 bg-primary/10 p-2 rounded-full transition-colors"
                    >
                      <Volume2 size={20} />
                    </button>
                  </div>
                </div>
                <div className="w-full bg-card p-4 rounded-xl border border-border mb-4 shadow-sm text-center">
                  <p className="text-muted-foreground text-lg leading-snug break-keep">{currentWord.meaning}</p>
                </div>
                {currentWord.examples[0] && (
                  <div className="w-full bg-warning/10 p-4 rounded-xl border border-warning/20 shadow-sm mb-3 text-left relative">
                    <span className="text-xs font-bold text-warning block mb-2 flex items-center gap-1">
                      <Quote size={12} /> 예문
                    </span>
                    <p className="text-lg font-medium text-foreground break-keep leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html: currentWord.examples[0].replace(
                          new RegExp(currentWord.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                          `<span class="text-destructive bg-destructive/10 px-1 rounded font-black">${currentWord.word}</span>`
                        )
                      }}
                    />
                  </div>
                )}
                <div className="w-full flex flex-col items-center mb-2">
                  {renderImage('small')}
                  {!wordImage && (
                    <span className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <ImageIcon size={12} /> 그림
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-auto pt-4 border-t border-border w-full">
                <button onClick={(e) => handleRate(false, e)}
                  className="bg-card border-2 border-secondary/30 text-secondary py-4 rounded-xl font-bold hover:bg-secondary/10 transition-colors flex flex-col items-center justify-center gap-1 shadow-sm"
                >
                  <HelpCircle size={24} />
                  <span>몰라요</span>
                </button>
                <button onClick={(e) => handleRate(true, e)}
                  className="bg-primary border-2 border-primary text-primary-foreground py-4 rounded-xl font-bold hover:bg-primary/90 transition-colors flex flex-col items-center justify-center gap-1 shadow-md"
                >
                  <CheckCircle size={24} />
                  <span>알아요</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/70 animate-fade-in p-4">
          <div className="bg-card rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border-4 border-primary/20 relative">
            {unknownDeck.length > 0 ? (
              <>
                <div className="text-6xl mb-4">💪</div>
                <h2 className="text-3xl font-bold mb-3 text-foreground font-display">조금 더 힘내볼까요?</h2>
                <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                  총 <span className="font-bold text-primary">{deck.length}</span>개 중{' '}
                  <span className="font-bold text-secondary">{unknownDeck.length}</span>개 단어를<br />
                  더 공부해야 해요.
                </p>
                <button onClick={handleRetry}
                  className="w-full bg-primary text-primary-foreground py-4 rounded-xl font-bold hover:bg-primary/90 shadow-lg transition-transform hover:scale-105 mb-3 flex items-center justify-center gap-2"
                >
                  <RotateCcw size={20} /> 틀린 단어 복습하기
                </button>
                <button onClick={() => { setShowModal(false); onBack?.(); }}
                  className="w-full bg-muted text-muted-foreground py-3 rounded-xl font-bold hover:bg-muted/80"
                >
                  오늘은 그만하기
                </button>
              </>
            ) : (
              <>
                <div className="text-6xl mb-4">🏆</div>
                <h2 className="text-3xl font-bold mb-3 text-foreground font-display">완벽해요!</h2>
                <p className="text-lg text-muted-foreground mb-8">모든 단어를 마스터했습니다.<br />참 잘했어요!</p>
                <button onClick={onComplete}
                  className="w-full bg-success text-success-foreground py-4 rounded-xl font-bold hover:bg-success/90 shadow-lg transition-transform hover:scale-105 animate-pulse flex items-center justify-center gap-2"
                >
                  다음 단계로 <ArrowRight size={20} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Step01Card;
