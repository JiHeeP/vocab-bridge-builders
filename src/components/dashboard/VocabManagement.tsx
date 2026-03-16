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
  Upload,
  XCircle,
} from "lucide-react";
import {
  autoFillVocab,
  createVocabSession,
  createVocabWord,
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

interface WordFormState {
  word: string;
  meaning: string;
  example1: string;
  example2: string;
  example3: string;
  relatedWords: string;
  l4Answer: string;
  l4Options: string;
  l5Chunks: string;
  l5TargetIndex: string;
  l5VocabDistractor: string;
  l5Hints: string;
  l5FullDistractors: string;
}

const emptyWordForm: WordFormState = {
  word: "",
  meaning: "",
  example1: "",
  example2: "",
  example3: "",
  relatedWords: "",
  l4Answer: "",
  l4Options: "",
  l5Chunks: "",
  l5TargetIndex: "2",
  l5VocabDistractor: "",
  l5Hints: "",
  l5FullDistractors: "",
};

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
  const [wordForm, setWordForm] = useState<WordFormState>(emptyWordForm);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [creatingWord, setCreatingWord] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [fetchingCurrentImages, setFetchingCurrentImages] = useState(false);
  const [fetchingAllImages, setFetchingAllImages] = useState(false);
  const [refreshingDefs, setRefreshingDefs] = useState(false);

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

  const handleCreateWord = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSession) {
      toast({ title: "세션을 먼저 선택하세요", variant: "destructive" });
      return;
    }

    setCreatingWord(true);
    try {
      await createVocabWord({
        sessionId: selectedSession.id,
        word: wordForm.word.trim(),
        meaning: wordForm.meaning.trim(),
        examples: [wordForm.example1, wordForm.example2, wordForm.example3].map((item) => item.trim()).filter(Boolean),
        relatedWords: wordForm.relatedWords.split(",").map((item) => item.trim()).filter(Boolean),
        l4: {
          answer: wordForm.l4Answer.trim(),
          options: wordForm.l4Options.split("/").map((item) => item.trim()).filter(Boolean),
        },
        l5: {
          chunks: wordForm.l5Chunks.split("/").map((item) => item.trim()).filter(Boolean),
          targetIndex: Number(wordForm.l5TargetIndex),
          vocabDistractor: wordForm.l5VocabDistractor.trim(),
          hints: wordForm.l5Hints.split("/").map((item) => item.trim()).filter(Boolean),
          fullDistractors: wordForm.l5FullDistractors.split(",").map((item) => item.trim()).filter(Boolean),
        },
      });

      setWordForm(emptyWordForm);
      setWords(await getVocabSessionWords(selectedSession.id));
      setCatalog(await getVocabCatalog(true));
      toast({ title: "어휘가 추가되었습니다", description: `${selectedSession.label}에 반영되었습니다.` });
    } catch (error) {
      toast({ title: "어휘 추가 실패", description: String(error), variant: "destructive" });
    } finally {
      setCreatingWord(false);
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

  const handleWordAutoFill = async () => {
    const word = wordForm.word.trim();
    if (!word || wordForm.meaning.trim()) return;

    const data = await autoFillVocab(word);
    if (data) {
      setWordForm((prev) => ({
        ...prev,
        meaning: prev.meaning || data.meaning,
        example1: prev.example1 || data.examples[0] || "",
      }));
      toast({ title: "자동 생성 완료", description: `'${word}'의 뜻과 예문이 자동 입력되었습니다.` });
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
              세션 생성, 수동 추가, 엑셀 업로드, 이미지 상태 관리를 한 화면에서 처리합니다.
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
                      <button
                        onClick={() => void handleToggleSession(session)}
                        className="text-xs font-bold text-primary hover:underline"
                      >
                        {session.isActive ? "비활성화" : "활성화"}
                      </button>
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

            <div className="rounded-2xl border border-border p-4">
              <div className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <Plus size={16} className="text-primary" /> 학습 어휘 수동 추가
              </div>
              <form onSubmit={handleCreateWord} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input value={wordForm.word} onChange={(event) => setWordForm((prev) => ({ ...prev, word: event.target.value }))} onBlur={() => void handleWordAutoFill()} className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="어휘 (입력 후 탭하면 자동 생성)" />
                  <input value={wordForm.meaning} onChange={(event) => setWordForm((prev) => ({ ...prev, meaning: event.target.value }))} className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="뜻" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input value={wordForm.example1} onChange={(event) => setWordForm((prev) => ({ ...prev, example1: event.target.value }))} className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="예문1" />
                  <input value={wordForm.example2} onChange={(event) => setWordForm((prev) => ({ ...prev, example2: event.target.value }))} className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="예문2" />
                  <input value={wordForm.example3} onChange={(event) => setWordForm((prev) => ({ ...prev, example3: event.target.value }))} className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="예문3" />
                </div>
                <input value={wordForm.relatedWords} onChange={(event) => setWordForm((prev) => ({ ...prev, relatedWords: event.target.value }))} className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="관련어 (쉼표 구분)" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input value={wordForm.l4Answer} onChange={(event) => setWordForm((prev) => ({ ...prev, l4Answer: event.target.value }))} className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="L4 정답" />
                  <input value={wordForm.l4Options} onChange={(event) => setWordForm((prev) => ({ ...prev, l4Options: event.target.value }))} className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="L4 보기 (/ 구분)" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input value={wordForm.l5Chunks} onChange={(event) => setWordForm((prev) => ({ ...prev, l5Chunks: event.target.value }))} className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="L5 chunks (/ 구분)" />
                  <input value={wordForm.l5TargetIndex} onChange={(event) => setWordForm((prev) => ({ ...prev, l5TargetIndex: event.target.value }))} className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="L5 targetIndex" inputMode="numeric" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input value={wordForm.l5VocabDistractor} onChange={(event) => setWordForm((prev) => ({ ...prev, l5VocabDistractor: event.target.value }))} className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="L5 vocabDistractor" />
                  <input value={wordForm.l5Hints} onChange={(event) => setWordForm((prev) => ({ ...prev, l5Hints: event.target.value }))} className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="L5 hints (/ 구분)" />
                </div>
                <input value={wordForm.l5FullDistractors} onChange={(event) => setWordForm((prev) => ({ ...prev, l5FullDistractors: event.target.value }))} className="rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="L5 fullDistractors (쉼표 구분)" />
                <button type="submit" disabled={creatingWord || !selectedSession} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
                  {creatingWord ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  현재 세션에 어휘 추가
                </button>
              </form>
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
        <div className="grid grid-cols-[80px_140px_1fr_160px_100px] text-sm">
          <div className="bg-muted px-4 py-3 font-bold text-muted-foreground border-b border-border">순서</div>
          <div className="bg-muted px-4 py-3 font-bold text-muted-foreground border-b border-border">어휘</div>
          <div className="bg-muted px-4 py-3 font-bold text-muted-foreground border-b border-border">뜻</div>
          <div className="bg-muted px-4 py-3 font-bold text-muted-foreground border-b border-border">세션</div>
          <div className="bg-muted px-4 py-3 font-bold text-muted-foreground border-b border-border text-center">이미지</div>

          {words.map((word) => {
            const hasImage = imageWords.has(word.word);
            return (
              <React.Fragment key={word.id}>
                <div className="px-4 py-2.5 border-b border-border/50 text-muted-foreground">{word.displayOrder}</div>
                <div className="px-4 py-2.5 border-b border-border/50 font-bold text-foreground">{word.word}</div>
                <div className="px-4 py-2.5 border-b border-border/50 text-foreground text-xs leading-relaxed">{word.meaning}</div>
                <div className="px-4 py-2.5 border-b border-border/50 text-xs text-muted-foreground">{selectedSession?.label ?? "-"}</div>
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
