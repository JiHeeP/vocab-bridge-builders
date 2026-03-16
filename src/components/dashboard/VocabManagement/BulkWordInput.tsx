import React, { useState } from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { aiGenerateFullVocab, bulkCreateWords, getVocabSessionWords, type VocabSession, type VocabWord } from "@/lib/vocabData";
import { toast } from "@/hooks/use-toast";

export interface BulkWordRow {
  word: string;
  meaning: string;
  example: string;
  relatedWords: string;
  l4: string;
  l5: string;
}

const EMPTY_ROWS = 10;

function createEmptyRows(): BulkWordRow[] {
  return Array.from({ length: EMPTY_ROWS }, () => ({
    word: "", meaning: "", example: "", relatedWords: "", l4: "", l5: "",
  }));
}

function parseL4String(s: string): { answer: string; options: string[] } | null {
  if (!s.trim()) return null;
  const parts = s.split("|").map((p) => p.trim());
  let answer = "";
  let options: string[] = [];
  for (const part of parts) {
    if (part.startsWith("정답:")) answer = part.replace("정답:", "").trim();
    else if (part.startsWith("보기:")) options = part.replace("보기:", "").split("/").map((i) => i.trim()).filter(Boolean);
  }
  return answer ? { answer, options } : null;
}

function parseL5String(s: string): { chunks: string[]; targetIndex: number; vocabDistractor: string; hints: string[]; fullDistractors: string[] } | null {
  if (!s.trim()) return null;
  const parts = s.split(" | ").map((p) => p.trim());
  let chunks: string[] = [];
  let targetIndex = 0;
  let vocabDistractor = "";
  let hints: string[] = [];
  let fullDistractors: string[] = [];
  for (const part of parts) {
    if (part.startsWith("chunks:")) chunks = part.replace("chunks:", "").split("/").map((i) => i.trim()).filter(Boolean);
    else if (part.startsWith("targetIndex:")) targetIndex = Number.parseInt(part.replace("targetIndex:", "").trim(), 10);
    else if (part.startsWith("vocabDistractor:")) vocabDistractor = part.replace("vocabDistractor:", "").trim();
    else if (part.startsWith("hints:")) hints = part.replace("hints:", "").split("/").map((i) => i.trim()).filter(Boolean);
    else if (part.startsWith("fullDistractors:")) fullDistractors = part.replace("fullDistractors:", "").split(",").map((i) => i.trim()).filter(Boolean);
  }
  return chunks.length > 0 ? { chunks, targetIndex, vocabDistractor, hints, fullDistractors } : null;
}

interface Props {
  selectedSession: VocabSession | null;
  onWordsSaved: (words: VocabWord[]) => void;
}

const BulkWordInput: React.FC<Props> = ({ selectedSession, onWordsSaved }) => {
  const [rows, setRows] = useState<BulkWordRow[]>(createEmptyRows());
  const [aiGenerating, setAiGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const filledCount = rows.filter((r) => r.word.trim()).length;

  const handleRowChange = (index: number, field: keyof BulkWordRow, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAiGenerate = async () => {
    const words = rows.map((r) => r.word.trim()).filter(Boolean);
    if (words.length === 0) {
      toast({ title: "어휘를 먼저 입력하세요", variant: "destructive" });
      return;
    }

    setAiGenerating(true);
    try {
      const generated = await aiGenerateFullVocab(words);

      setRows((prev) => {
        const next = [...prev];
        for (const gen of generated) {
          const rowIndex = next.findIndex(
            (r) => r.word.trim() === gen.word || r.word.trim() === gen.word.trim(),
          );
          if (rowIndex !== -1) {
            next[rowIndex] = {
              ...next[rowIndex],
              meaning: gen.meaning || next[rowIndex].meaning,
              example: gen.example || next[rowIndex].example,
              relatedWords: gen.relatedWords?.length > 0
                ? gen.relatedWords.join(", ")
                : next[rowIndex].relatedWords,
            };
          }
        }
        return next;
      });

      toast({
        title: "AI 생성 완료",
        description: `${generated.length}개 어휘의 뜻, 예문, 관련어가 생성되었습니다.`,
      });
    } catch (error) {
      toast({ title: "AI 생성 실패", description: String(error), variant: "destructive" });
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!selectedSession) {
      toast({ title: "세션을 먼저 선택하세요", variant: "destructive" });
      return;
    }

    const wordsToSave = rows.filter((r) => r.word.trim());
    if (wordsToSave.length === 0) {
      toast({ title: "저장할 어휘가 없습니다", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const result = await bulkCreateWords(
        selectedSession.id,
        wordsToSave.map((row) => ({
          word: row.word,
          meaning: row.meaning,
          example: row.example,
          relatedWords: row.relatedWords
            ? row.relatedWords.split(",").map((s) => s.trim()).filter(Boolean)
            : undefined,
          l4: parseL4String(row.l4) || undefined,
          l5: parseL5String(row.l5) || undefined,
        })),
      );
      setRows(createEmptyRows());

      const updatedWords = await getVocabSessionWords(selectedSession.id);
      onWordsSaved(updatedWords);

      toast({
        title: "어휘 일괄 저장 완료",
        description: `${result.insertedCount}개 어휘가 추가되었습니다.`,
      });
    } catch (error) {
      toast({ title: "일괄 저장 실패", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
        <Plus size={16} className="text-primary" /> 어휘 일괄 입력 (최대 10개)
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        어휘만 입력하고 <strong>AI 자동 생성</strong> 버튼을 누르면 뜻, 예문, 관련어가 자동으로 만들어집니다.
        음절선택(L4)과 어절조립(L5)은 저장 시 자동 생성됩니다. 직접 입력도 가능합니다.
      </p>

      <div className="space-y-2 overflow-x-auto">
        <div className="grid grid-cols-[32px_0.7fr_1fr_1.2fr_0.8fr_0.8fr_0.8fr] gap-1.5 text-xs font-bold text-muted-foreground px-1 min-w-[900px]">
          <div>#</div>
          <div>어휘</div>
          <div>뜻</div>
          <div>예문</div>
          <div>관련어</div>
          <div>음절선택 (L4)</div>
          <div>어절조립 (L5)</div>
        </div>

        {rows.map((row, index) => (
          <div key={index} className="grid grid-cols-[32px_0.7fr_1fr_1.2fr_0.8fr_0.8fr_0.8fr] gap-1.5 items-center min-w-[900px]">
            <div className="text-xs text-muted-foreground text-center font-bold">{index + 1}</div>
            <input
              value={row.word}
              onChange={(e) => handleRowChange(index, "word", e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              placeholder="어휘 입력"
            />
            <input
              value={row.meaning}
              onChange={(e) => handleRowChange(index, "meaning", e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              placeholder="AI 자동생성"
            />
            <input
              value={row.example}
              onChange={(e) => handleRowChange(index, "example", e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              placeholder="AI 자동생성"
            />
            <input
              value={row.relatedWords}
              onChange={(e) => handleRowChange(index, "relatedWords", e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              placeholder="AI 자동생성"
            />
            <input
              value={row.l4}
              onChange={(e) => handleRowChange(index, "l4", e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              placeholder="자동생성"
            />
            <input
              value={row.l5}
              onChange={(e) => handleRowChange(index, "l5", e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              placeholder="자동생성"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={() => void handleAiGenerate()}
          disabled={aiGenerating || filledCount === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 hover:from-violet-600 hover:to-purple-700 transition-all"
        >
          {aiGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          AI 자동 생성 (뜻+예문+관련어) ({filledCount}개)
        </button>

        <button
          onClick={() => void handleSave()}
          disabled={saving || !selectedSession || filledCount === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          세션에 저장
        </button>

        <button
          onClick={() => setRows(createEmptyRows())}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted"
        >
          초기화
        </button>

        {filledCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {filledCount}개 어휘 입력됨
          </span>
        )}
      </div>
    </div>
  );
};

export default BulkWordInput;
