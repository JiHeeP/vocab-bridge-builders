import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Users, ArrowRight } from 'lucide-react';

const DEFAULT_STUDENTS = [
  "김민수", "이지수", "박서연", "정하늘", "최유진",
  "강도윤", "윤서준", "임지호", "한소율", "오태양",
  "장미래", "송하람", "신예은", "홍길동", "문채원",
  "배준혁", "류다온"
];

const Index = () => {
  const navigate = useNavigate();
  const [students] = useState(DEFAULT_STUDENTS);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero */}
      <div className="bg-primary text-primary-foreground py-12 px-4 text-center">
        <h1 className="text-5xl md:text-6xl font-bold font-display mb-3">어휘의 징검다리</h1>
        <p className="text-lg md:text-xl opacity-90 mb-2">다문화 학생 맞춤형 어휘 학습 프로그램</p>
        <p className="text-sm opacity-70">학습도구어 기반 6단계 어휘 학습</p>
      </div>

      {/* Student Selection */}
      <div className="flex-1 max-w-2xl mx-auto w-full p-6">
        <div className="flex items-center gap-2 mb-6">
          <Users size={20} className="text-primary" />
          <h2 className="text-xl font-bold text-foreground">내 이름을 찾아 터치하세요</h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {students.map((name, idx) => (
            <button
              key={idx}
              onClick={() => navigate(`/learn?student=${encodeURIComponent(name)}`)}
              className="bg-card border-2 border-border hover:border-primary hover:bg-primary/5 rounded-2xl py-5 px-4 text-lg font-bold text-foreground shadow-sm hover:shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 touch-manipulation"
            >
              <span>{name}</span>
              <ArrowRight size={16} className="text-muted-foreground" />
            </button>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
            <BookOpen size={14} /> 6단계 학습: 카드 → 매칭 → 관련어 → 블록 → 퀴즈 → 소나기
          </p>
          <button onClick={() => navigate('/dashboard')} className="text-sm text-primary font-bold hover:underline">
            📊 교사 대시보드
          </button>
        </div>
      </div>
    </div>
  );
};

export default Index;
