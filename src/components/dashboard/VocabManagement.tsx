import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle,
  FolderKanban,
  ImageDown,
  Layers3,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import {
  aiGenerateFullVocab,
  type AiGeneratedFullVocab,
  bulkCreateWords,
  createVocabSession,
  createVocabWord,
  deleteVocabSession,
  deleteVocabWord,
  getContentSubjectGroups,
  getSessionDisplayName,
  getToolSessions,
  getVocabCatalog,
  getVocabSessionWords,
  importVocabSpreadsheet,
  refreshAllDefinitions,
  updateVocabSession,
  type VocabCatalog,
  type VocabSession,
  type VocabWord,
} from "@/lib/vocabData";
import { fetchAndCacheImages, getWordImageWordList } from "@/lib/wordImageService";
import { VOCAB_CATEGORY_LABELS, VOCAB_SUBJECTS, type VocabCategory, type VocabSubject } from "@/lib/vocabConstants";
import { toast } from "@/hooks/use-toast";

interface Props {
  onBack: () => void;
}

interface BulkWordRow {
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

const VocabManagement: React.FC<Props> = ({ onBack }) => {
  const [catalog, setCatalog] = useState<VocabCatalog>({ sessions: [] });
  const [words, setWords] = useState<VocabWord[]>([]);
  const [imageWords, setImageWords] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<VocabCategory>("tool");
  const [selectedSubject, setSelectedSubject] = useState<VocabSubject | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [sessionForm, setSessionForm] = useState({
    category: "tool" as VocabCategory,
    subject: "국어" as VocabSubject,
    sessionNo: "",
    label: "",
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [fetchingCurrentImages, setFetchingCurrentImages] = useState(false);
  const [fetchingAllImages, setFetchingAllImages] = useState(false);
  const [refreshingDefs, setRefreshingDefs] = useState(false);

  const [expandedWordId, setExpandedWordId] = useState<number | null>(null);

  // Bulk input state
  const [bulkRows, setBulkRows] = useState<BulkWordRow[]>(createEmptyRows());
  const [aiGenerating, setAiGenerating] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  const toolSessions = useMemo(() => getToolSessions(catalog), [catalog]);
  const contentGroups = useMemo(() => getContentSubjectGroups(catalog), [catalog]);

  const visibleSessions = useMemo(() => {
    if (selectedCategory === "tool") {
      return catalog.sessions.filter((s) => s.category === "tool");
    }

    return catalog.sessions.filter(
      (s) => s.category === "content" && s.subject === selectedSubject,
    );
  }, [catalog, selectedCategory, selectedSubject]);

  const selectedSession = useMemo(
    () => visibleSessions.find((session) => session.id === selectedSessionId) ?? null,
    [selectedSessionId, visibleSessions],
  );

  const sessionMissingCount = words.filter((word) => !imageWords.has(word.word)).length;

  const filledWordCount = bulkRows.filter((r) => r.word.trim()).length;

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (selectedCategory === "content" && !selectedSubject) {
      setSelectedSubject(VOCAB_SUBJECTS[0]);
    }
    if (selectedCategory === "tool") {
      setSelectedSubject(null);
    }
  }, [selectedCategory, selectedSubject]);

  useEffect(() => {
    if (!visibleSessions.length) {
      setSelectedSessionId("");
      return;
    }

    if (!visibleSessions.some((session) => session.id === selectedSessionId)) {
      setSelectedSessionId(visibleSessions[0].id);
    }
  }, [selectedSessionId, visibleSessions]);

  useEffect(() => {
    if (!selectedSessionId) {
      setWords([]);
      return;
    }

    setSessionLoading(true);
    getVocabSessionWords(selectedSessionId)
      .then((rows) => setWords(rows))
      .finally(() => setSessionLoading(false));
  }, [selectedSessionId]);

  const loadData = async () => {
    const [catalogResult, imageResult] = await Promise.all([
      getVocabCatalog(true),
      getWordImageWordList(),
    ]);

    setCatalog(catalogResult);
    setImageWords(new Set(imageResult));
    setLoading(false);
  };

  const loadAllWords = async () => {
    const allSessions = (await getVocabCatalog(true)).sessions;
    const allWords = await Promise.all(allSessions.map((session) => getVocabSessionWords(session.id)));
    return allWords.flat();
  };

  const handleCreateSession = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreatingSession(true);

    try {
      const created = await createVocabSession({
        category: sessionForm.category,
        subject: sessionForm.category === "content" ? sessionForm.subject : null,
        sessionNo: Number(sessionForm.sessionNo),
        label: sessionForm.label.trim() || undefined,
      });

      await loadData();
      setSelectedCategory(created.category);
      setSelectedSubject(created.subject);
      setSelectedSessionId(created.id);
      setSessionForm({
        category: sessionForm.category,
        subject: sessionForm.subject,
        sessionNo: "",
        label: "",
      });
      toast({ title: "세션이 생성되었습니다", description: getSessionDisplayName(created) });
    } catch (error) {
      toast({ title: "세션 생성 실패", description: String(error), variant: "destructive" });
    } finally {
      setCreatingSession(false);
    }
  };

  const handleImport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!uploadFile) {
      toast({ title: "업로드 파일을 선택하세요", variant: "destructive" });
      return;
    }

    if (selectedCategory === "content" && !selectedSubject) {
      toast({ title: "과목을 먼저 선택하세요", variant: "destructive" });
      return;
    }

    setImporting(true);
    try {
      const result = await importVocabSpreadsheet({
        file: uploadFile,
        category: selectedCategory,
        subject: selectedCategory === "content" ? selectedSubject : null,
      });

      setUploadFile(null);
      const nextCatalog = await getVocabCatalog(true);
      setCatalog(nextCatalog);
      if (result.createdSessions.length > 0) {
        setSelectedSessionId(result.createdSessions[0].id);
        setWords(await getVocabSessionWords(result.createdSessions[0].id));
      }
      toast({
        title: "어휘 업로드 완료",
        description: `추가 ${result.insertedCount}개 · 생성 세션 ${result.createdSessions.length}개 · 중복 건너뜀 ${result.skippedCount}개 · 실패 ${result.failedRows.length}개`,
      });
    } catch (error) {
      toast({ title: "업로드 실패", description: String(error), variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const handleFetchCurrentImages = async () => {
    const missingWords = words.filter((word) => !imageWords.has(word.word));
    if (missingWords.length === 0) {
      toast({ title: "현재 세션의 이미지가 모두 준비되어 있습니다" });
      return;
    }

    setFetchingCurrentImages(true);
    try {
      const payload = missingWords.map((word) => ({ word: word.word, meaning: word.meaning }));
      const result = await fetchAndCacheImages(payload);
      const fetched = result.results.filter((row) => row.status === "fetched").length;
      const cached = result.results.filter((row) => row.status === "already_cached").length;
      setImageWords(new Set(await getWordImageWordList()));
      toast({
        title: "현재 세션 이미지 수집 완료",
        description: `새로 ${fetched}개 · 기존 ${cached}개`,
      });
    } catch (error) {
      toast({ title: "이미지 수집 실패", description: String(error), variant: "destructive" });
    } finally {
      setFetchingCurrentImages(false);
    }
  };

  const handleFetchAllImages = async () => {
    setFetchingAllImages(true);
    try {
      const allWords = await loadAllWords();
      const uniqueWords = Array.from(new Map(allWords.map((word) => [word.word, word])).values());
      const missingWords = uniqueWords.filter((word) => !imageWords.has(word.word));

      if (missingWords.length === 0) {
        toast({ title: "전체 어휘 이미지가 모두 준비되어 있습니다" });
        return;
      }

      const result = await fetchAndCacheImages(missingWords.map((word) => ({ word: word.word, meaning: word.meaning })));
      const fetched = result.results.filter((row) => row.status === "fetched").length;
      const cached = result.results.filter((row) => row.status === "already_cached").length;
      setImageWords(new Set(await getWordImageWordList()));
      toast({
        title: "전체 이미지 수집 완료",
        description: `새로 ${fetched}개 · 기존 ${cached}개`,
      });
    } catch (error) {
      toast({ title: "전체 이미지 수집 실패", description: String(error), variant: "destructive" });
    } finally {
      setFetchingAllImages(false);
    }
  };

  const handleToggleSession = async (session: VocabSession) => {
    try {
      await updateVocabSession(session.id, !session.isActive);
      setCatalog(await getVocabCatalog(true));
      toast({
        title: session.isActive ? "세션이 비활성화되었습니다" : "세션이 활성화되었습니다",
        description: getSessionDisplayName({ ...session, isActive: !session.isActive }),
      });
    } catch (error) {
      toast({ title: "세션 상태 변경 실패", description: String(error), variant: "destructive" });
    }
  };

  const handleRefreshDefinitions = async () => {
    setRefreshingDefs(true);
    try {
      const result = await refreshAllDefinitions();
      if (selectedSessionId) {
        setWords(await getVocabSessionWords(selectedSessionId));
      }
      toast({ title: "뜻/예문 업데이트 완료", description: `${result.updatedCount}개 어휘가 초2 수준으로 업데이트되었습니다.` });
    } catch (error) {
      toast({ title: "업데이트 실패", description: String(error), variant: "destructive" });
    } finally {
      setRefreshingDefs(false);
    }
  };

  const handleDeleteWord = async (wordId: number) => {
    if (!confirm("이 어휘를 삭제하시겠습니까?")) return;
    try {
      await deleteVocabWord(wordId);
      setWords(prev => prev.filter(w => w.id !== wordId));
      setCatalog(await getVocabCatalog(true));
      toast({ title: "어휘가 삭제되었습니다" });
    } catch (error) {
      toast({ title: "삭제 실패", description: String(error), variant: "destructive" });
    }
  };

  const handleDeleteSession = async (session: VocabSession) => {
    if (!confirm(`"${session.label}" 세션과 포함된 모든 어휘를 삭제하시겠습니까?`)) return;
    try {
      await deleteVocabSession(session.id);
      setCatalog(await getVocabCatalog(true));
      if (selectedSessionId === session.id) {
        setSelectedSessionId("");
        setWords([]);
      }
      toast({ title: "세션이 삭제되었습니다" });
    } catch (error) {
      toast({ title: "삭제 실패", description: String(error), variant: "destructive" });
    }
  };

  // Bulk row handlers
  const handleBulkRowChange = (index: number, field: keyof BulkWordRow, value: string) => {
    setBulkRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAiGenerate = async () => {
    const wordsToGenerate = bulkRows
      .map((r) => r.word.trim())
      .filter(Boolean);

    if (wordsToGenerate.length === 0) {
      toast({ title: "어휘를 먼저 입력하세요", variant: "destructive" });
      return;
    }

    setAiGenerating(true);
    try {
      const generated = await aiGenerateFullVocab(wordsToGenerate);

      // Map generated results back to rows
      setBulkRows((prev) => {
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

  const handleBulkSave = async () => {
    if (!selectedSession) {
      toast({ title: "세션을 먼저 선택하세요", variant: "destructive" });
      return;
    }

    const wordsToSave = bulkRows.filter((r) => r.word.trim());
    if (wordsToSave.length === 0) {
      toast({ title: "저장할 어휘가 없습니다", variant: "destructive" });
      return;
    }

    setBulkSaving(true);
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
      setBulkRows(createEmptyRows());
      setWords(await getVocabSessionWords(selectedSession.id));
      setCatalog(await getVocabCatalog(true));
      toast({
        title: "어휘 일괄 저장 완료",
        description: `${result.insertedCount}개 어휘가 추가되었습니다.`,
      });
    } catch (error) {
      toast({ title: "일괄 저장 실패", description: String(error), variant: "destructive" });
    } finally {
      setBulkSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-primary font-bold hover:underline flex items-center gap-1">
        <ArrowLeft size={16} /> 돌아가기
      </button>

      <section className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
              <BookOpen size={20} className="text-primary" /> 어휘 관리
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              세션 생성, 어휘 일괄 입력, AI 자동 생성, 이미지 관리를 한 화면에서 처리합니다.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void handleFetchCurrentImages()}
              disabled={fetchingCurrentImages || !selectedSession || sessionMissingCount === 0}
              className="flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
            >
              {fetchingCurrentImages ? <Loader2 size={16} className="animate-spin" /> : <ImageDown size={16} />}
              현재 세션 이미지
            </button>
            <button
              onClick={() => void handleFetchAllImages()}
              disabled={fetchingAllImages}
              className="flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl border border-border text-foreground hover:bg-muted"
            >
              {fetchingAllImages ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              전체 이미지 수집
            </button>
            <button
              onClick={() => void handleRefreshDefinitions()}
              disabled={refreshingDefs}
              className="flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl border border-primary text-primary hover:bg-primary/5"
            >
              {refreshingDefs ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              초2 뜻/예문 업데이트
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          <div className="space-y-6">
            <div className="rounded-2xl border border-border p-4">
              <div className="text-sm font-bold text-foreground mb-3">세션 필터</div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {(["tool", "content"] as VocabCategory[]).map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`px-3 py-2 rounded-xl text-sm font-bold border transition-all ${
                      selectedCategory === category
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {VOCAB_CATEGORY_LABELS[category]}
                  </button>
                ))}
              </div>

              {selectedCategory === "content" && (
                <select
                  value={selectedSubject ?? ""}
                  onChange={(event) => setSelectedSubject(event.target.value as VocabSubject)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  {VOCAB_SUBJECTS.map((subject) => (
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="rounded-2xl border border-border p-4">
              <div className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <Layers3 size={16} className="text-primary" /> 세션 목록
              </div>
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {visibleSessions.map((session) => (
                  <div
                    key={session.id}
                    className={`rounded-2xl border p-3 transition-all ${
                      selectedSessionId === session.id ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <button onClick={() => setSelectedSessionId(session.id)} className="w-full text-left">
                      <div className="font-bold text-foreground">{session.label}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {session.subject ? `${session.subject} · ` : ""}
                        {session.wordCount}개 어휘
                      </div>
                    </button>
                    <div className="mt-3 flex items-center justify-between">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-bold ${
                          session.isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {session.isActive ? "활성" : "비활성"}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => void handleToggleSession(session)}
                          className="text-xs font-bold text-primary hover:underline"
                        >
                          {session.isActive ? "비활성화" : "활성화"}
                        </button>
                        <button
                          onClick={() => void handleDeleteSession(session)}
                          className="text-xs font-bold text-destructive hover:underline"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {visibleSessions.length === 0 && (
                  <div className="text-sm text-muted-foreground py-8 text-center">표시할 세션이 없습니다.</div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-border p-4">
              <div className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <Plus size={16} className="text-primary" /> 세션 생성
              </div>
              <form onSubmit={handleCreateSession} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <select
                  value={sessionForm.category}
                  onChange={(event) => setSessionForm((prev) => ({ ...prev, category: event.target.value as VocabCategory }))}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="tool">{VOCAB_CATEGORY_LABELS.tool}</option>
                  <option value="content">{VOCAB_CATEGORY_LABELS.content}</option>
                </select>
                <select
                  value={sessionForm.subject}
                  onChange={(event) => setSessionForm((prev) => ({ ...prev, subject: event.target.value as VocabSubject }))}
                  disabled={sessionForm.category !== "content"}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
                >
                  {VOCAB_SUBJECTS.map((subject) => (
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </select>
                <input
                  value={sessionForm.sessionNo}
                  onChange={(event) => setSessionForm((prev) => ({ ...prev, sessionNo: event.target.value }))}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  placeholder="세션 번호"
                  inputMode="numeric"
                />
                <input
                  value={sessionForm.label}
                  onChange={(event) => setSessionForm((prev) => ({ ...prev, label: event.target.value }))}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  placeholder="라벨 (선택)"
                />
                <button
                  type="submit"
                  disabled={creatingSession}
                  className="md:col-span-4 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
                >
                  {creatingSession ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  세션 만들기
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-border p-4">
              <div className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <FolderKanban size={16} className="text-primary" /> 현재 선택 세션
              </div>
              {selectedSession ? (
                <div className="text-sm text-foreground">
                  <div className="font-bold">{getSessionDisplayName(selectedSession)}</div>
                  <div className="text-muted-foreground mt-1">
                    {selectedSession.wordCount}개 어휘 · 이미지 미보유 {sessionMissingCount}개
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">세션을 선택하세요.</div>
              )}
            </div>

            {/* Bulk Word Input - 10 words at once */}
            <div className="rounded-2xl border border-border p-4">
              <div className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <Plus size={16} className="text-primary" /> 어휘 일괄 입력 (최대 10개)
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                어휘만 입력하고 <strong>AI 자동 생성</strong> 버튼을 누르면 뜻, 예문, 관련어가 자동으로 만들어집니다.
                음절선택(L4)과 어절조립(L5)은 저장 시 자동 생성됩니다. 직접 입력도 가능합니다.
              </p>

              <div className="space-y-2 overflow-x-auto">
                {/* Header */}
                <div className="grid grid-cols-[32px_0.7fr_1fr_1.2fr_0.8fr_0.8fr_0.8fr] gap-1.5 text-xs font-bold text-muted-foreground px-1 min-w-[900px]">
                  <div>#</div>
                  <div>어휘</div>
                  <div>뜻</div>
                  <div>예문</div>
                  <div>관련어</div>
                  <div>음절선택 (L4)</div>
                  <div>어절조립 (L5)</div>
                </div>

                {/* Rows */}
                {bulkRows.map((row, index) => (
                  <div key={index} className="grid grid-cols-[32px_0.7fr_1fr_1.2fr_0.8fr_0.8fr_0.8fr] gap-1.5 items-center min-w-[900px]">
                    <div className="text-xs text-muted-foreground text-center font-bold">{index + 1}</div>
                    <input
                      value={row.word}
                      onChange={(e) => handleBulkRowChange(index, "word", e.target.value)}
                      className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      placeholder="어휘 입력"
                    />
                    <input
                      value={row.meaning}
                      onChange={(e) => handleBulkRowChange(index, "meaning", e.target.value)}
                      className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      placeholder="AI 자동생성"
                    />
                    <input
                      value={row.example}
                      onChange={(e) => handleBulkRowChange(index, "example", e.target.value)}
                      className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      placeholder="AI 자동생성"
                    />
                    <input
                      value={row.relatedWords}
                      onChange={(e) => handleBulkRowChange(index, "relatedWords", e.target.value)}
                      className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      placeholder="AI 자동생성"
                    />
                    <input
                      value={row.l4}
                      onChange={(e) => handleBulkRowChange(index, "l4", e.target.value)}
                      className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      placeholder="자동생성"
                    />
                    <input
                      value={row.l5}
                      onChange={(e) => handleBulkRowChange(index, "l5", e.target.value)}
                      className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      placeholder="자동생성"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={() => void handleAiGenerate()}
                  disabled={aiGenerating || filledWordCount === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 hover:from-violet-600 hover:to-purple-700 transition-all"
                >
                  {aiGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  AI 자동 생성 (뜻+예문+관련어) ({filledWordCount}개)
                </button>

                <button
                  onClick={() => void handleBulkSave()}
                  disabled={bulkSaving || !selectedSession || filledWordCount === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
                >
                  {bulkSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  세션에 저장
                </button>

                <button
                  onClick={() => setBulkRows(createEmptyRows())}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted"
                >
                  초기화
                </button>

                {filledWordCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {filledWordCount}개 어휘 입력됨
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border p-4">
              <div className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <Upload size={16} className="text-primary" /> 엑셀/CSV 업로드
              </div>
              <form onSubmit={handleImport} className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  현재 CSV와 동일한 컬럼 양식을 사용합니다. 업로드한 어휘는 선택한 분류 기준으로 10개씩 자동 분할되어 새 세션이 만들어집니다.
                </div>
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-foreground file:mr-3 file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2 file:font-bold file:text-primary-foreground"
                />
                <div className="text-xs text-muted-foreground">
                  업로드 대상: {selectedCategory === "tool" ? VOCAB_CATEGORY_LABELS.tool : `${VOCAB_CATEGORY_LABELS.content} · ${selectedSubject ?? "과목 선택 필요"}`}
                </div>
                <button type="submit" disabled={importing || !uploadFile || (selectedCategory === "content" && !selectedSubject)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted disabled:opacity-50">
                  {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  자동 세션 분할 업로드
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="font-bold text-foreground">세션 어휘 목록</div>
          {sessionLoading && <Loader2 size={16} className="animate-spin text-primary" />}
        </div>
        <div className="grid grid-cols-[60px_120px_1fr_80px_80px] text-sm">
          <div className="bg-muted px-4 py-3 font-bold text-muted-foreground border-b border-border">순서</div>
          <div className="bg-muted px-4 py-3 font-bold text-muted-foreground border-b border-border">어휘</div>
          <div className="bg-muted px-4 py-3 font-bold text-muted-foreground border-b border-border">뜻</div>
          <div className="bg-muted px-4 py-3 font-bold text-muted-foreground border-b border-border text-center">이미지</div>
          <div className="bg-muted px-4 py-3 font-bold text-muted-foreground border-b border-border text-center">작업</div>

          {words.map((word) => {
            const hasImage = imageWords.has(word.word);
            const isExpanded = expandedWordId === word.id;
            return (
              <React.Fragment key={word.id}>
                <div className="px-4 py-2.5 border-b border-border/50 text-muted-foreground">{word.displayOrder}</div>
                <div
                  className="px-4 py-2.5 border-b border-border/50 font-bold text-foreground cursor-pointer hover:text-primary"
                  onClick={() => setExpandedWordId(isExpanded ? null : word.id)}
                >
                  {word.word} <span className="text-xs text-muted-foreground">{isExpanded ? "▲" : "▼"}</span>
                </div>
                <div className="px-4 py-2.5 border-b border-border/50 text-foreground text-xs leading-relaxed">{word.meaning}</div>
                <div className="px-4 py-2.5 border-b border-border/50 text-center">
                  {hasImage ? (
                    <CheckCircle size={16} className="text-success inline" />
                  ) : (
                    <XCircle size={16} className="text-muted-foreground inline" />
                  )}
                </div>
                <div className="px-4 py-2.5 border-b border-border/50 text-center">
                  <button onClick={() => void handleDeleteWord(word.id)} className="text-destructive hover:underline text-xs font-bold">
                    <Trash2 size={14} className="inline" />
                  </button>
                </div>

                {isExpanded && (
                  <div className="col-span-5 bg-muted/30 px-6 py-4 border-b border-border/50 text-xs space-y-2">
                    <div><strong>예문:</strong> {word.examples[0] || "(없음)"}</div>
                    <div><strong>관련어:</strong> {word.relatedWords.join(", ") || "(없음)"}</div>
                    <div><strong>L4 (음절선택):</strong> 정답: {word.l4.answer}, 보기: {word.l4.options.join(", ")}</div>
                    <div><strong>L5 (어절조립):</strong> {word.l5.chunks.join(" / ") || "(없음)"}</div>
                  </div>
                )}
              </React.Fragment>
            );
          })}

          {!sessionLoading && words.length === 0 && (
            <div className="col-span-5 px-4 py-10 text-center text-sm text-muted-foreground">
              선택된 세션에 아직 등록된 어휘가 없습니다.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default VocabManagement;
