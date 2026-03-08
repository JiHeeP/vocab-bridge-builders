import React, { useState, useEffect } from 'react';
import { ArrowLeft, BookOpen, ImageIcon, CheckCircle, XCircle, Loader2, ImageDown } from 'lucide-react';
import { loadVocabData, type VocabWord } from '@/lib/vocabData';
import { supabase } from '@/integrations/supabase/client';
import { fetchAndCacheImages } from '@/lib/wordImageService';
import { toast } from '@/hooks/use-toast';

interface Props {
  onBack: () => void;
}

const VocabManagement: React.FC<Props> = ({ onBack }) => {
  const [words, setWords] = useState<VocabWord[]>([]);
  const [imageWords, setImageWords] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [fetchingImages, setFetchingImages] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [vocabResult, imageResult] = await Promise.all([
      loadVocabData(),
      supabase.from('word_images').select('word'),
    ]);
    setWords(vocabResult.words);
    setImageWords(new Set((imageResult.data || []).map(r => r.word)));
    setLoading(false);
  };

  const handleFetchImages = async () => {
    const missingWords = words.filter(w => !imageWords.has(w.word));
    if (missingWords.length === 0) {
      toast({ title: '모든 어휘의 이미지가 준비되어 있습니다' });
      return;
    }
    setFetchingImages(true);
    try {
      const payload = missingWords.map(w => ({ word: w.word, meaning: w.meaning }));
      const result = await fetchAndCacheImages(payload);
      const fetched = result.results.filter(r => r.status === 'fetched').length;
      const cached = result.results.filter(r => r.status === 'already_cached').length;
      toast({ title: '이미지 다운로드 완료', description: `새로 가져옴: ${fetched}개, 기존: ${cached}개` });
      // Reload image status
      const { data } = await supabase.from('word_images').select('word');
      setImageWords(new Set((data || []).map(r => r.word)));
    } catch (err) {
      toast({ title: '이미지 다운로드 실패', description: String(err), variant: 'destructive' });
    } finally {
      setFetchingImages(false);
    }
  };

  const missingCount = words.filter(w => !imageWords.has(w.word)).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <button onClick={onBack} className="mb-4 text-primary font-bold hover:underline flex items-center gap-1">
        <ArrowLeft size={16} /> 돌아가기
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BookOpen size={20} className="text-primary" /> 어휘 관리
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            전체 {words.length}개 · 이미지 완료 {words.length - missingCount}개 · 미완료 {missingCount}개
          </p>
        </div>
        <button
          onClick={handleFetchImages}
          disabled={fetchingImages || missingCount === 0}
          className="flex items-center gap-1.5 text-sm font-bold px-4 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {fetchingImages ? <Loader2 size={16} className="animate-spin" /> : <ImageDown size={16} />}
          {fetchingImages ? '다운로드 중...' : `이미지 가져오기 (${missingCount}개)`}
        </button>
      </div>

      {/* Word list */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-0 text-sm">
          {/* Header */}
          <div className="bg-muted px-4 py-3 font-bold text-muted-foreground border-b border-border">No.</div>
          <div className="bg-muted px-4 py-3 font-bold text-muted-foreground border-b border-border">어휘</div>
          <div className="bg-muted px-4 py-3 font-bold text-muted-foreground border-b border-border">뜻</div>
          <div className="bg-muted px-4 py-3 font-bold text-muted-foreground border-b border-border text-center">이미지</div>

          {/* Rows */}
          {words.map((w, i) => {
            const hasImage = imageWords.has(w.word);
            return (
              <React.Fragment key={w.id}>
                <div className="px-4 py-2.5 border-b border-border/50 text-muted-foreground">{i + 1}</div>
                <div className="px-4 py-2.5 border-b border-border/50 font-bold text-foreground">{w.word}</div>
                <div className="px-4 py-2.5 border-b border-border/50 text-foreground text-xs leading-relaxed truncate">{w.meaning}</div>
                <div className="px-4 py-2.5 border-b border-border/50 text-center">
                  {hasImage ? (
                    <CheckCircle size={16} className="text-success inline" />
                  ) : (
                    <XCircle size={16} className="text-muted-foreground inline" />
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default VocabManagement;
