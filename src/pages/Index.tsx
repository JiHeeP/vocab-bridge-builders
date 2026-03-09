import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Users, ArrowRight, Loader2 } from 'lucide-react';
import { getAllStudents, type StudentData } from '@/lib/scoreService';
import { toast } from '@/hooks/use-toast';

const Index = () => {
  const navigate = useNavigate();
  const [students, setStudents] = useState<StudentData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllStudents()
      .then(setStudents)
      .catch((error) => {
        toast({
          title: '학생 목록을 불러오지 못했습니다',
          description: String(error),
          variant: 'destructive',
        });
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-primary text-primary-foreground py-12 px-4 text-center">
        <h1 className="text-5xl md:text-6xl font-bold font-display mb-3">어휘의 징검다리</h1>
        <p className="text-lg md:text-xl opacity-90 mb-2">다문화 학생 맞춤형 어휘 학습 프로그램</p>
        <p className="text-sm opacity-70">학습도구어 기반 6단계 어휘 학습</p>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full p-6">
        <div className="flex items-center gap-2 mb-6">
          <Users size={20} className="text-primary" />
          <h2 className="text-xl font-bold text-foreground">내 이름을 찾아 터치하세요</h2>
        </div>

        {loading ? (
          <div className="py-16 text-center text-muted-foreground">
            <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" />
            학생 목록을 불러오는 중...
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {students.map((student) => (
              <button
                key={student.id}
                onClick={() => navigate(`/learn?student=${encodeURIComponent(student.name)}`)}
                className="bg-card border-2 border-border hover:border-primary hover:bg-primary/5 rounded-2xl py-5 px-4 text-lg font-bold text-foreground shadow-sm hover:shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 touch-manipulation"
              >
                <span>{student.name}</span>
                <ArrowRight size={16} className="text-muted-foreground" />
              </button>
            ))}
          </div>
        )}

        {!loading && students.length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            등록된 학생이 없습니다. 교사 대시보드에서 학생을 추가하면 이 화면에 바로 반영됩니다.
          </div>
        )}

        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
            <BookOpen size={14} /> 6단계 학습: 카드 → 매칭 → 관련어 → 블록 → 퀴즈 → 소나기
          </p>
          <button onClick={() => navigate('/dashboard')} className="text-sm text-primary font-bold hover:underline">
            교사 대시보드
          </button>
        </div>
      </div>
    </div>
  );
};

export default Index;
