import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, RotateCcw, Award } from 'lucide-react';
import { type VocabWord, generateBadWords, pick, shuffle } from '@/lib/vocabData';

interface Step06Props {
  words: VocabWord[];
  allWords: VocabWord[];
  onComplete: (scores?: any[]) => void;
  onBack?: () => void;
}

interface WordBubble {
  text: string; isCorrect: boolean; x: number; y: number; width: number; speed: number; removed: boolean;
}

interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; color: string;
}

interface TopicData {
  word: string;
  good: string[];
  bad: string[];
}

const Step06VocabShower: React.FC<Step06Props> = ({ words, allWords, onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gameStateRef = useRef<'STOP' | 'PLAYING' | 'END'>('STOP');
  const wordsRef = useRef<WordBubble[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const lastTimeRef = useRef(0);
  const spawnTimerRef = useRef(0);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const currentTopicIdxRef = useRef(0);
  const collectedCountRef = useRef(0);
  const timeLeftRef = useRef(80);
  const topicsRef = useRef<TopicData[]>([]);

  const [uiState, setUiState] = useState({
    gameState: 'STOP' as string,
    score: 0, timeLeft: 80, combo: 0, currentTopic: '준비',
    collectedCount: 0, showCombo: false, feedbackColor: null as string | null,
    isClear: false,
  });

  const GOAL_COUNT = 4;

  useEffect(() => {
    const topics: TopicData[] = words.map(w => {
      let goodPool = [...w.relatedWords];

      // If not enough related words, supplement from other words' relatedWords
      if (goodPool.length < 4) {
        const supplementPool = allWords
          .filter(other => other.word !== w.word)
          .flatMap(other => other.relatedWords)
          .filter(rw => !goodPool.includes(rw) && rw !== w.word);
        const needed = 4 - goodPool.length;
        goodPool = [...goodPool, ...shuffle(supplementPool).slice(0, needed)];
      }

      return {
        word: w.word,
        good: goodPool,
        bad: generateBadWords(w, allWords, 5),
      };
    });
    topicsRef.current = topics;
  }, [words, allWords]);

  const initAudio = () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
  };

  const playSoundEffect = useCallback((type: string) => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    const now = ctx.currentTime;
    if (type === 'good') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(523.25, now); osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.3, now); gain.gain.linearRampToValueAtTime(0.01, now + 0.3); osc.start(); osc.stop(now + 0.3);
    } else if (type === 'bad') {
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, now); osc.frequency.linearRampToValueAtTime(100, now + 0.2);
      gain.gain.setValueAtTime(0.3, now); gain.gain.linearRampToValueAtTime(0.01, now + 0.3); osc.start(); osc.stop(now + 0.3);
    } else if (type === 'clear') {
      osc.type = 'square'; osc.frequency.setValueAtTime(400, now); osc.frequency.linearRampToValueAtTime(1200, now + 0.3);
      gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0.01, now + 0.5); osc.start(); osc.stop(now + 0.5);
    }
  }, []);

  const startGame = () => {
    initAudio();
    gameStateRef.current = 'PLAYING'; scoreRef.current = 0; timeLeftRef.current = 80;
    currentTopicIdxRef.current = 0; collectedCountRef.current = 0; comboRef.current = 0;
    wordsRef.current = []; particlesRef.current = []; lastTimeRef.current = performance.now(); spawnTimerRef.current = 0;
    const topics = topicsRef.current;
    setUiState({ gameState: 'PLAYING', score: 0, timeLeft: 80, combo: 0, currentTopic: topics[0]?.word || '', collectedCount: 0, showCombo: false, feedbackColor: null, isClear: false });
    requestRef.current = requestAnimationFrame(gameLoop);
  };

  useEffect(() => {
    let interval: any = null;
    if (uiState.gameState === 'PLAYING') {
      interval = setInterval(() => {
        timeLeftRef.current -= 1;
        setUiState(prev => ({ ...prev, timeLeft: timeLeftRef.current }));
        if (timeLeftRef.current <= 0) endGame(false);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [uiState.gameState]);

  const endGame = (isClear: boolean) => {
    gameStateRef.current = 'END';
    cancelAnimationFrame(requestRef.current);
    setUiState(prev => ({ ...prev, gameState: 'END', isClear }));
  };

  const spawnWord = (canvasWidth: number) => {
    const topics = topicsRef.current;
    if (currentTopicIdxRef.current >= topics.length) return;
    const data = topics[currentTopicIdxRef.current];
    const activeTexts = wordsRef.current.map(w => w.text);
    let text = ""; let isCorrect = false; let attempts = 0;
    while (attempts < 10) {
      isCorrect = Math.random() < 0.6;
      const pool = isCorrect ? data.good : data.bad;
      text = pool[Math.floor(Math.random() * pool.length)];
      if (text && !activeTexts.includes(text)) break;
      attempts++;
    }
    if (!text || activeTexts.includes(text)) return;
    const x = Math.random() * (canvasWidth - 120) + 60;
    let currentSpeed = 2.5 + (comboRef.current * 0.2);
    if (currentSpeed > 8) currentSpeed = 8;
    wordsRef.current.push({ text, isCorrect, x, y: -60, width: 0, speed: currentSpeed, removed: false });
  };

  const createParticles = (x: number, y: number, color: string) => {
    for (let i = 0; i < 8; i++) {
      particlesRef.current.push({ x, y, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, life: 1.0, color });
    }
  };

  const handleInput = (e: React.MouseEvent | React.TouchEvent) => {
    if (gameStateRef.current !== 'PLAYING') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const mx = clientX - rect.left; const my = clientY - rect.top;
    const wordsList = wordsRef.current;
    const topics = topicsRef.current;
    for (let i = wordsList.length - 1; i >= 0; i--) {
      let w = wordsList[i];
      if (w.removed) continue;
      if (mx > w.x - w.width / 2 - 20 && mx < w.x + w.width / 2 + 20 && my > w.y - 35 && my < w.y + 35) {
        if (w.isCorrect) {
          scoreRef.current += 10 + (comboRef.current * 2); comboRef.current += 1; collectedCountRef.current += 1;
          playSoundEffect('good'); createParticles(w.x, w.y, '#2ecc71');
          setUiState(prev => ({ ...prev, feedbackColor: 'green' }));
          setTimeout(() => setUiState(prev => ({ ...prev, feedbackColor: null })), 150);
          if (collectedCountRef.current >= GOAL_COUNT) {
            playSoundEffect('clear'); currentTopicIdxRef.current += 1;
            if (currentTopicIdxRef.current < topics.length) {
              setUiState(prev => ({ ...prev, currentTopic: topics[currentTopicIdxRef.current].word }));
            } else { endGame(true); }
            collectedCountRef.current = 0;
          }
        } else {
          scoreRef.current = Math.max(0, scoreRef.current - 10); comboRef.current = 0;
          playSoundEffect('bad'); createParticles(w.x, w.y, '#e74c3c');
          setUiState(prev => ({ ...prev, feedbackColor: 'red' }));
          setTimeout(() => setUiState(prev => ({ ...prev, feedbackColor: null })), 150);
        }
        w.removed = true;
        setUiState(prev => ({ ...prev, score: scoreRef.current, combo: comboRef.current, collectedCount: collectedCountRef.current, showCombo: comboRef.current > 1 }));
        e.preventDefault(); break;
      }
    }
  };

  const gameLoop = (time: number) => {
    if (gameStateRef.current !== 'PLAYING') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dt = time - lastTimeRef.current;
    lastTimeRef.current = time;
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let spawnRate = Math.max(500, 1200 - (comboRef.current * 100));
    spawnTimerRef.current += dt;
    if (spawnTimerRef.current > spawnRate) { spawnWord(canvas.width); spawnTimerRef.current = 0; }
    wordsRef.current.forEach(w => {
      if (w.removed) return;
      w.y += w.speed;
      ctx.font = "bold 35px 'Jua', sans-serif";
      const metrics = ctx.measureText(w.text);
      w.width = metrics.width + 40;
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.roundRect(w.x - w.width / 2, w.y - 25, w.width, 50, 25);
      ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = "#ecf0f1"; ctx.stroke();
      ctx.fillStyle = "#2c3e50"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(w.text, w.x, w.y);
      if (w.y > canvas.height + 30) {
        w.removed = true;
        if (w.isCorrect) {
          scoreRef.current = Math.max(0, scoreRef.current - 5); comboRef.current = 0;
          setUiState(prev => ({ ...prev, score: scoreRef.current, combo: 0, showCombo: false }));
        }
      }
    });
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      let p = particlesRef.current[i];
      p.x += p.vx; p.y += p.vy; p.life -= 0.05;
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fill();
      if (p.life <= 0) particlesRef.current.splice(i, 1);
    }
    ctx.globalAlpha = 1;
    requestRef.current = requestAnimationFrame(gameLoop);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-b from-info/40 to-info/10 font-game select-none" style={{ touchAction: 'none' }}>
      {uiState.feedbackColor && (
        <div className={`absolute inset-0 pointer-events-none z-20 transition-opacity duration-150 ${uiState.feedbackColor === 'red' ? 'bg-destructive/30' : 'bg-success/20'}`} />
      )}
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start z-10 pointer-events-none">
        <div>
          <div className="bg-card/90 px-5 py-2 rounded-2xl shadow-md text-center mb-2">
            <span className="block text-sm text-muted-foreground">점수</span>
            <span className="text-2xl font-bold text-foreground">{uiState.score}</span>
          </div>
          <div className="bg-card/90 px-5 py-2 rounded-2xl shadow-md text-center">
            <span className="block text-sm text-muted-foreground">남은 시간</span>
            <span className={`text-2xl font-bold ${uiState.timeLeft < 10 ? 'text-destructive' : 'text-foreground'}`}>{uiState.timeLeft}</span>
          </div>
        </div>
        <div className={`transition-all duration-200 transform text-right ${uiState.showCombo ? 'opacity-100 scale-110' : 'opacity-0 scale-100'}`}>
          <div className="text-5xl font-black text-secondary drop-shadow-md">{uiState.combo}</div>
          <div className="text-xl font-bold text-foreground">COMBO! 🔥</div>
        </div>
      </div>
      <div className="absolute top-[15%] left-1/2 transform -translate-x-1/2 text-center pointer-events-none z-10 w-full">
        <h1 key={uiState.currentTopic} className="text-7xl text-card drop-shadow-lg m-0 animate-pop-in">{uiState.currentTopic}</h1>
        <div className="flex justify-center gap-4 mt-4">
          {[...Array(GOAL_COUNT)].map((_, i) => (
            <div key={i} className={`w-6 h-6 rounded-full border-2 border-card transition-all duration-300 ${i < uiState.collectedCount ? 'bg-success scale-125 shadow-[0_0_10px_hsl(var(--success))]' : 'bg-card/30'}`} />
          ))}
        </div>
        <p className="text-card/80 mt-2 text-lg">관련 단어 4개를 모으세요!</p>
      </div>
      <canvas ref={canvasRef} className="block w-full h-full" onMouseDown={handleInput} onTouchStart={handleInput} />

      {uiState.gameState === 'STOP' && (
        <div className="absolute inset-0 bg-foreground/70 flex justify-center items-center z-50">
          <div className="bg-card p-10 rounded-[30px] text-center max-w-lg w-[90%] shadow-2xl animate-fade-in">
            <h1 className="text-5xl text-primary mb-2 font-game">어휘 소나기</h1>
            <p className="text-muted-foreground text-lg mb-6">주제와 <strong>관련된 단어</strong>만 골라내세요!</p>
            <div className="bg-muted rounded-xl p-6 mb-8 text-left space-y-2 text-foreground">
              <p>✅ <strong>관련 단어:</strong> 터치해서 점수 획득 (+10)</p>
              <p>🚫 <strong>엉뚱한 단어:</strong> 건드리지 말고 패스!</p>
              <p>⚡️ <strong>연속 정답:</strong> 속도가 점점 빨라져요!</p>
            </div>
            <button onClick={startGame} className="bg-primary hover:bg-primary/90 text-primary-foreground text-2xl py-4 px-12 rounded-full shadow-lg active:translate-y-1 transition-all flex items-center justify-center gap-2 mx-auto">
              <Play fill="currentColor" /> 게임 시작
            </button>
          </div>
        </div>
      )}

      {uiState.gameState === 'END' && (
        <div className="absolute inset-0 bg-foreground/70 flex justify-center items-center z-50">
          <div className="bg-card p-10 rounded-[30px] text-center max-w-lg w-[90%] shadow-2xl animate-fade-in">
            <h1 className={`text-5xl mb-4 font-game ${uiState.isClear ? 'text-success' : 'text-destructive'}`}>
              {uiState.isClear ? '🏆 미션 클리어!' : '⏰ 시간 종료'}
            </h1>
            <div className="mb-8">
              <p className="text-muted-foreground text-xl">최종 점수</p>
              <p className="text-6xl font-bold text-primary">{uiState.score}</p>
            </div>
            <div className="flex gap-4 justify-center">
              <button onClick={startGame} className="bg-primary hover:bg-primary/90 text-primary-foreground text-xl py-4 px-8 rounded-full shadow-lg flex items-center gap-2">
                <RotateCcw /> 다시 도전
              </button>
              <button onClick={() => onComplete()} className="bg-success hover:bg-success/90 text-success-foreground text-xl py-4 px-8 rounded-full shadow-lg flex items-center gap-2">
                완료 <Award />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Step06VocabShower;
