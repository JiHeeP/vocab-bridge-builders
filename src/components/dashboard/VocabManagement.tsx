import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle,
  FolderKanban,
  ImageDown,
  Layers3,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import {
  aiGenerateFullVocab,
  type BulkWordFailure,
  bulkCreateWords,
  createVocabSession,
  deleteVocabSession,
  deleteVocabWord,
  getSessionDisplayName,
  getVocabCatalog,
  getVocabSessionWords,
  importVocabSpreadsheet,
  refreshAllDefinitions,
  updateVocabWord,
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

interface BulkRowValidation {
  word?: string;
  meaning?: string;
  example?: string;
}

interface UploadReport {
  insertedCount: number;
  skippedCount: number;
  failedRows: BulkWordFailure[];
  skippedRows: BulkWordFailure[];
  createdSessions: VocabSession[];
}

interface ImageFetchRow {
  word: string;
  status: string;
  query?: string;
}

function stringifyL4(data?: { answer: string; options: string[] } | null): string {
  if (!data?.answer) return "";
  return `정답:${data.answer} | 보기:${(data.options ?? []).join("/")}`;
}

function stringifyL5(data?: { chunks: string[]; targetIndex: number; vocabDistractor: string; hints: string[]; fullDistractors: string[] } | null): string {
  if (!data?.chunks?.length) return "";
  return `chunks:${data.chunks.join("/")} | targetIndex:${data.targetIndex} | vocabDistractor:${data.vocabDistractor} | hints:${data.hints.join("/")} | fullDistractors:${data.fullDistractors.join(",")}`;
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
  const [loadingError, setLoadingError] = useState<string>("");
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
  const [uploadReport, setUploadReport] = useState<UploadReport | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionLoadError, setSessionLoadError] = useState<string>("");
  const [fetchingCurrentImages, setFetchingCurrentImages] = useState(false);
  const [fetchingAllImages, setFetchingAllImages] = useState(false);
  const [refreshingImageWord, setRefreshingImageWord] = useState<string>("");
  const [imageFetchResults, setImageFetchResults] = useState<ImageFetchRow[]>([]);
  const [refreshingDefs, setRefreshingDefs] = useState(false);

  const [expandedWordId, setExpandedWordId] = useState<number | null>(null);
  const [editingWordId, setEditingWordId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    word: "",
    meaning: "",
    example: "",
    relatedWords: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Bulk input state
  const [bulkRows, setBulkRows] = useState<BulkWordRow[]>(createEmptyRows());
  const [aiGenerating, setAiGenerating] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkRowErrors, setBulkRowErrors] = useState<Record<number, BulkRowValidation>>({});
  const [bulkSaveReport, setBulkSaveReport] = useState<{ failedRows: BulkWordFailure[]; skippedRows: BulkWordFailure[] } | null>(null);

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

  const suggestedSessionNo = useMemo(() => {
    const matchingSessions = catalog.sessions.filter((session) =>
      session.category === sessionForm.category &&
      (sessionForm.category === "tool" ? session.subject === null : session.subject === sessionForm.subject),
    );
    return matchingSessions.length > 0
      ? Math.max(...matchingSessions.map((session) => session.sessionNo)) + 1
      : 1;
  }, [catalog.sessions, sessionForm.category, sessionForm.subject]);

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
    setSessionLoadError("");
    getVocabSessionWords(selectedSessionId)
      .then((rows) => setWords(rows))
      .catch((error) => {
        setWords([]);
        setSessionLoadError(String(error));
      })
      .finally(() => setSessionLoading(false));
  }, [selectedSessionId]);

  const loadData = async () => {
    setLoading(true);
    setLoadingError("");
    try {
      const [catalogResult, imageResult] = await Promise.all([
        getVocabCatalog(true),
        getWordImageWordList(),
      ]);

      setCatalog(catalogResult);
      setImageWords(new Set(imageResult));
    } catch (error) {
      setLoadingError(String(error));
    } finally {
      setLoading(false);
    }
  };

  const loadAllWords = async () => {
    const allSessions = (await getVocabCatalog(true)).sessions;
    const allWords = await Promise.all(allSessions.map((session) => getVocabSessionWords(session.id)));
    return allWords.flat();
  };

  const validateSessionForm = () => {
    const parsedSessionNo = Number(sessionForm.sessionNo);
    if (!Number.isInteger(parsedSessionNo) || parsedSessionNo <= 0) {
      return "세션 번호는 1 이상의 정수여야 합니다.";
    }

    const duplicated = catalog.sessions.some((session) =>
      session.category === sessionForm.category &&
      (sessionForm.category === "tool" ? session.subject === null : session.subject === sessionForm.subject) &&
      session.sessionNo === parsedSessionNo,
    );

    if (duplicated) {
      return "같은 분류에 이미 존재하는 세션 번호입니다.";
    }

    return "";
  };

  const validateBulkRows = (targetRows: BulkWordRow[]) => {
    const nextErrors: Record<number, BulkRowValidation> = {};
    const duplicateMap = new Map<string, number[]>();

    targetRows.forEach((row, index) => {
      const word = row.word.trim();
      if (!word) return;
      const normalized = word.toLowerCase();
      duplicateMap.set(normalized, [...(duplicateMap.get(normalized) ?? []), index]);
    });

    targetRows.forEach((row, index) => {
      const entry: BulkRowValidation = {};
      const word = row.word.trim();
      if (!word) return;

      if (!row.meaning.trim()) {
        entry.meaning = "뜻을 입력하거나 AI 자동 생성을 먼저 실행하세요.";
      }
      if (!row.example.trim()) {
        entry.example = "예문을 입력하거나 AI 자동 생성을 먼저 실행하세요.";
      }
      if (words.some((item) => item.word.trim().toLowerCase() === word.toLowerCase())) {
        entry.word = "이미 선택한 세션에 존재하는 어휘입니다.";
      }
      if ((duplicateMap.get(word.toLowerCase())?.length ?? 0) > 1) {
        entry.word = "입력 목록 안에 중복된 어휘입니다.";
      }

      if (entry.word || entry.meaning || entry.example) {
        nextErrors[index] = entry;
      }
    });

    return nextErrors;
  };

  const handleCreateSession = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationMessage = validateSessionForm();
    if (validationMessage) {
      toast({ title: "세션 생성 전 확인", description: validationMessage, variant: "destructive" });
      return;
    }
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
      toast({ title: "세션 생성 실패", description: "세션 번호 또는 분류 설정을 다시 확인하세요.", variant: "destructive" });
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
      setUploadReport(result);
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
      setImageFetchResults(result.results);
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
      setImageFetchResults(result.results);
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

  const handleRefreshWordImage = async (word: VocabWord) => {
    setRefreshingImageWord(word.word);
    try {
      const result = await fetchAndCacheImages([{ word: word.word, meaning: word.meaning }], true);
      setImageFetchResults(result.results);
      setImageWords(new Set(await getWordImageWordList()));
      toast({
        title: "이미지를 다시 찾았습니다",
        description: `${word.word} 이미지가 새 검색 결과로 교체되었습니다.`,
      });
    } catch (error) {
      toast({ title: "이미지 다시 찾기 실패", description: String(error), variant: "destructive" });
    } finally {
      setRefreshingImageWord("");
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
    setBulkRowErrors((prev) => {
      if (!prev[index]) return prev;
      const next = { ...prev };
      next[index] = { ...next[index], [field]: undefined };
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
      setBulkSaveReport(null);
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
              l4: gen.l4 ? stringifyL4(gen.l4) : next[rowIndex].l4,
              l5: gen.l5 ? stringifyL5(gen.l5) : next[rowIndex].l5,
            };
          }
        }
        return next;
      });

      toast({
        title: "AI 생성 완료",
        description: `${generated.length}개 어휘의 뜻, 예문, L3/L4/L5 재료가 생성되었습니다.`,
      });
      setBulkRowErrors((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          const index = Number(key);
          if (bulkRows[index]?.word.trim()) {
            next[index] = { ...next[index], meaning: undefined, example: undefined };
          }
        });
        return next;
      });
    } catch (error) {
      toast({ title: "AI 생성 실패", description: String(error), variant: "destructive" });
    } finally {
      setAiGenerating(false);
    }
  };

  const handleBulkSave = async () => {
    const wordsToSave = bulkRows.filter((r) => r.word.trim());
    if (wordsToSave.length === 0) {
      toast({ title: "저장할 어휘가 없습니다", variant: "destructive" });
      return;
    }

    const validationErrors = validateBulkRows(bulkRows);
    setBulkRowErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      toast({ title: "저장 전 확인 필요", description: "빨간 안내가 있는 행을 먼저 수정하세요.", variant: "destructive" });
      return;
    }

    setBulkSaving(true);
    try {
      setBulkSaveReport(null);
      let sessionToUse = selectedSession;
      if (!sessionToUse) {
        const draftSessionNo = sessionForm.sessionNo || String(suggestedSessionNo);
        if (!sessionForm.sessionNo) {
          setSessionForm((prev) => ({ ...prev, sessionNo: draftSessionNo }));
        }
        const parsedSessionNo = Number(draftSessionNo);
        const duplicated = catalog.sessions.some((session) =>
          session.category === sessionForm.category &&
          (sessionForm.category === "tool" ? session.subject === null : session.subject === sessionForm.subject) &&
          session.sessionNo === parsedSessionNo,
        );
        const validationMessage = !Number.isInteger(parsedSessionNo) || parsedSessionNo <= 0
          ? "세션 번호는 1 이상의 정수여야 합니다."
          : duplicated
            ? "같은 분류에 이미 존재하는 세션 번호입니다."
            : "";
        if (validationMessage) {
          toast({ title: "세션 생성 정보 확인", description: validationMessage, variant: "destructive" });
          return;
        }
        sessionToUse = await createVocabSession({
          category: sessionForm.category,
          subject: sessionForm.category === "content" ? sessionForm.subject : null,
          sessionNo: parsedSessionNo,
          label: sessionForm.label.trim() || undefined,
        });
        await loadData();
        setSelectedCategory(sessionToUse.category);
        setSelectedSubject(sessionToUse.subject);
        setSelectedSessionId(sessionToUse.id);
      }

      const result = await bulkCreateWords(
        sessionToUse.id,
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

      setBulkSaveReport({ failedRows: result.failedRows, skippedRows: result.skippedRows });
      if (result.insertedCount > 0) {
        setBulkRows(createEmptyRows());
        setBulkRowErrors({});
        setWords(await getVocabSessionWords(sessionToUse.id));
        setCatalog(await getVocabCatalog(true));
        toast({
          title: "어휘 일괄 저장 완료",
          description: `${result.insertedCount}개 어휘가 추가되었습니다.`,
        });
      } else {
        toast({
          title: "일괄 저장 중단",
          description: "문제가 있는 행을 수정한 뒤 다시 저장하세요.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({ title: "일괄 저장 실패", description: String(error), variant: "destructive" });
    } finally {
      setBulkSaving(false);
    }
  };

  const startEditingWord = (word: VocabWord) => {
    setEditingWordId(word.id);
    setEditForm({
      word: word.word,
      meaning: word.meaning,
      example: word.examples[0] ?? "",
      relatedWords: word.relatedWords.join(", "),
    });
    setExpandedWordId(word.id);
  };

  const handleSaveEdit = async (wordId: number) => {
    if (!editForm.word.trim() || !editForm.meaning.trim() || !editForm.example.trim()) {
      toast({ title: "수정 전 확인", description: "어휘, 뜻, 예문은 필수입니다.", variant: "destructive" });
      return;
    }

    setSavingEdit(true);
    try {
      await updateVocabWord(wordId, {
        word: editForm.word.trim(),
        meaning: editForm.meaning.trim(),
        examples: [editForm.example.trim()],
        relatedWords: editForm.relatedWords.split(",").map((item) => item.trim()).filter(Boolean),
      });
      if (selectedSessionId) {
        setWords(await getVocabSessionWords(selectedSessionId));
      }
      setEditingWordId(null);
      toast({ title: "어휘 수정 완료" });
    } catch (error) {
      toast({ title: "어휘 수정 실패", description: String(error), variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (loadingError) {
    return (
      <div className="space-y-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
        <div className="flex items-center gap-2 font-bold text-destructive">
          <AlertTriangle size={18} /> 어휘 관리 화면을 불러오지 못했습니다
        </div>
        <div className="text-sm text-muted-foreground">{loadingError}</div>
        <button
          onClick={() => void loadData()}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >
          <RefreshCw size={16} /> 다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-primary font-bold hover:underline flex items-center gap-1">
        <ArrowLeft size={16} /> 돌아가기
      </button>

      <section className="overflow-hidden rounded-[28px] border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-xl font-bold text-foreground sm:text-2xl">
              <BookOpen size={20} className="text-primary" /> 어휘 관리
            </h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              세션 생성, 어휘 입력, AI 자동 생성, 이미지 수집 상태를 한 번에 정리할 수 있도록 화면 구조를 다시 정돈했습니다.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[420px]">
            <button
              onClick={() => void handleFetchCurrentImages()}
              disabled={fetchingCurrentImages || !selectedSession || sessionMissingCount === 0}
              className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {fetchingCurrentImages ? <Loader2 size={16} className="animate-spin" /> : <ImageDown size={16} />}
              현재 세션 이미지 수집
            </button>
            <button
              onClick={() => void handleFetchAllImages()}
              disabled={fetchingAllImages}
              className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-2 text-sm font-bold text-foreground transition hover:bg-muted"
            >
              {fetchingAllImages ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              전체 이미지 수집
            </button>
            <button
              onClick={() => void handleRefreshDefinitions()}
              disabled={refreshingDefs}
              className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-primary bg-primary/5 px-4 py-2 text-sm font-bold text-primary transition hover:bg-primary/10 sm:col-span-2"
            >
              {refreshingDefs ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              AI 생성 기준 업데이트
            </button>
          </div>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
          <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-primary/5 to-background p-4">
            <div className="text-xs font-bold text-primary">현재 상태</div>
            <div className="mt-1 text-2xl font-bold text-foreground">{catalog.sessions.length}</div>
            <div className="mt-1 text-xs text-muted-foreground">등록된 전체 세션 수</div>
          </div>
          <div className="rounded-2xl border border-border bg-muted/20 p-4">
            <div className="text-xs font-bold text-primary">레벨 4</div>
            <div className="mt-1 text-sm font-semibold text-foreground">음절 선택용 정답/교란 자동 생성</div>
            <div className="mt-1 text-xs text-muted-foreground">활용형, 음절 블록, 혼동용 교란 음절 규칙을 AI 프롬프트에 반영했습니다.</div>
          </div>
          <div className="rounded-2xl border border-border bg-muted/20 p-4">
            <div className="text-xs font-bold text-primary">레벨 5</div>
            <div className="mt-1 text-sm font-semibold text-foreground">4어절 문장 조립 재료 생성</div>
            <div className="mt-1 text-xs text-muted-foreground">목적어 위치, 힌트, 어절 교란 카드까지 한 번에 생성합니다.</div>
          </div>
          <div className="rounded-2xl border border-border bg-muted/20 p-4">
            <div className="text-xs font-bold text-primary">이미지 준비</div>
            <div className="mt-1 text-sm font-semibold text-foreground">
              {selectedSession ? `${Math.max(words.length - sessionMissingCount, 0)} / ${words.length}` : "세션 선택 필요"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {selectedSession ? `현재 선택 세션 기준 이미지 미보유 ${sessionMissingCount}개` : "세션을 선택하면 이미지 준비 상태가 표시됩니다."}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-6">
              <div className="rounded-3xl border border-border bg-background/70 p-5">
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

              <div className="rounded-3xl border border-border bg-background/70 p-5">
              <div className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <Layers3 size={16} className="text-primary" /> 세션 목록
              </div>
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {visibleSessions.map((session) => (
                  <div
                    key={session.id}
                    className={`rounded-2xl border p-4 transition-all ${
                      selectedSessionId === session.id ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card/60"
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

            <div className="grid gap-6">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.9fr)]">
                <div className="rounded-3xl border border-border bg-background/70 p-5">
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
                  onChange={(event) => setSessionForm((prev) => ({ ...prev, sessionNo: event.target.value.replace(/[^0-9]/g, "") }))}
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
              <div className="mt-3 text-xs text-muted-foreground">
                추천 세션 번호: <button type="button" onClick={() => setSessionForm((prev) => ({ ...prev, sessionNo: String(suggestedSessionNo) }))} className="font-bold text-primary hover:underline">{suggestedSessionNo}</button>
              </div>
                </div>

                <div className="rounded-3xl border border-border bg-background/70 p-5">
              <div className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <FolderKanban size={16} className="text-primary" /> 현재 선택 세션
              </div>
              {selectedSession ? (
                <div className="space-y-3 text-sm text-foreground">
                  <div>
                    <div className="font-bold">{getSessionDisplayName(selectedSession)}</div>
                    <div className="mt-1 text-muted-foreground">
                    {selectedSession.wordCount}개 어휘 · 이미지 미보유 {sessionMissingCount}개
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border bg-card/70 p-3">
                      <div className="text-xs font-semibold text-muted-foreground">세션 상태</div>
                      <div className="mt-1 font-bold text-foreground">{selectedSession.isActive ? "활성" : "비활성"}</div>
                    </div>
                    <div className="rounded-2xl border border-border bg-card/70 p-3">
                      <div className="text-xs font-semibold text-muted-foreground">분류</div>
                      <div className="mt-1 font-bold text-foreground">
                        {selectedSession.category === "tool" ? VOCAB_CATEGORY_LABELS.tool : `${VOCAB_CATEGORY_LABELS.content} · ${selectedSession.subject}`}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">세션을 선택하지 않아도 저장 시 새 세션을 만들 수 있습니다.</div>
              )}
                </div>
              </div>

              <div className="rounded-3xl border border-border bg-background/70 p-5">
              <div className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <Plus size={16} className="text-primary" /> 어휘 일괄 입력 (최대 10개)
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                어휘만 입력하고 <strong>AI 자동 생성</strong> 버튼을 누르면 뜻, 예문, 관련어가 자동으로 만들어집니다.
                이제 AI가 레벨 3 관련어, 레벨 4 음절선택, 레벨 5 어절조립까지 함께 채워 줍니다. 필요하면 직접 수정도 가능합니다.
              </p>

              <div className="space-y-3 rounded-2xl border border-border bg-card/60 p-3 sm:p-4">
                <div className="hidden xl:grid xl:grid-cols-[40px_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] xl:gap-2 xl:px-1 xl:text-xs xl:font-bold xl:text-muted-foreground">
                  <div>#</div>
                  <div>어휘</div>
                  <div>뜻</div>
                  <div>예문</div>
                  <div>관련어</div>
                  <div>음절선택 (L4)</div>
                  <div>어절조립 (L5)</div>
                </div>

                {bulkRows.map((row, index) => (
                  <div key={index} className="rounded-2xl border border-border/80 bg-background/80 p-3 shadow-sm xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none">
                    <div className="mb-3 flex items-center justify-between xl:hidden">
                      <div className="text-sm font-bold text-foreground">행 {index + 1}</div>
                      <div className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                        {row.word.trim() ? "입력 중" : "비어 있음"}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[40px_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] xl:gap-2">
                      <div className="hidden xl:flex xl:min-h-11 xl:items-center xl:justify-center xl:rounded-xl xl:bg-muted/60 xl:px-2 xl:text-xs xl:font-bold xl:text-muted-foreground">
                        {index + 1}
                      </div>

                      <label className="space-y-1.5">
                        <span className="text-[11px] font-semibold text-muted-foreground xl:hidden">어휘</span>
                        <input
                          value={row.word}
                          onChange={(e) => handleBulkRowChange(index, "word", e.target.value)}
                          className="min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          placeholder="어휘 입력"
                        />
                        {bulkRowErrors[index]?.word && <span className="block text-[11px] text-destructive">{bulkRowErrors[index]?.word}</span>}
                      </label>

                      <label className="space-y-1.5">
                        <span className="text-[11px] font-semibold text-muted-foreground xl:hidden">뜻</span>
                        <input
                          value={row.meaning}
                          onChange={(e) => handleBulkRowChange(index, "meaning", e.target.value)}
                          className="min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          placeholder="AI 자동생성"
                        />
                        {bulkRowErrors[index]?.meaning && <span className="block text-[11px] text-destructive">{bulkRowErrors[index]?.meaning}</span>}
                      </label>

                      <label className="space-y-1.5 sm:col-span-2 xl:col-span-1">
                        <span className="text-[11px] font-semibold text-muted-foreground xl:hidden">예문</span>
                        <input
                          value={row.example}
                          onChange={(e) => handleBulkRowChange(index, "example", e.target.value)}
                          className="min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          placeholder="AI 자동생성"
                        />
                        {bulkRowErrors[index]?.example && <span className="block text-[11px] text-destructive">{bulkRowErrors[index]?.example}</span>}
                      </label>

                      <label className="space-y-1.5">
                        <span className="text-[11px] font-semibold text-muted-foreground xl:hidden">관련어</span>
                        <input
                          value={row.relatedWords}
                          onChange={(e) => handleBulkRowChange(index, "relatedWords", e.target.value)}
                          className="min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          placeholder="AI 자동생성"
                        />
                      </label>

                      <label className="space-y-1.5">
                        <span className="text-[11px] font-semibold text-muted-foreground xl:hidden">음절선택 (L4)</span>
                        <input
                          value={row.l4}
                          onChange={(e) => handleBulkRowChange(index, "l4", e.target.value)}
                          className="min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          placeholder="자동생성"
                        />
                      </label>

                      <label className="space-y-1.5">
                        <span className="text-[11px] font-semibold text-muted-foreground xl:hidden">어절조립 (L5)</span>
                        <input
                          value={row.l5}
                          onChange={(e) => handleBulkRowChange(index, "l5", e.target.value)}
                          className="min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          placeholder="자동생성"
                        />
                      </label>
                    </div>

                    {(bulkRowErrors[index]?.word || bulkRowErrors[index]?.meaning || bulkRowErrors[index]?.example) && (
                      <div className="mt-2 hidden xl:grid xl:grid-cols-[40px_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] xl:gap-2 xl:px-1 xl:text-[11px] xl:text-destructive">
                        <div />
                        <div>{bulkRowErrors[index]?.word}</div>
                        <div>{bulkRowErrors[index]?.meaning}</div>
                        <div>{bulkRowErrors[index]?.example}</div>
                        <div />
                        <div />
                        <div />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
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
                  disabled={bulkSaving || filledWordCount === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
                >
                  {bulkSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  {selectedSession ? "세션에 저장" : "새 세션 생성 후 저장"}
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
              <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                AI 생성 시 <strong>레벨 3</strong>은 관련어 10개, <strong>레벨 4</strong>는 음절 블록 데이터, <strong>레벨 5</strong>는 4어절 조립 데이터를 우선 생성합니다.
              </div>

              {bulkSaveReport && (bulkSaveReport.failedRows.length > 0 || bulkSaveReport.skippedRows.length > 0) && (
                <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm">
                  <div className="font-bold text-destructive mb-2">일괄 저장 결과</div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div>
                      <div className="font-semibold mb-1">실패 행</div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {bulkSaveReport.failedRows.length === 0 && <div>없음</div>}
                        {bulkSaveReport.failedRows.map((row) => (
                          <div key={`failed-${row.rowNumber}`}>{row.rowNumber}행 · {row.word ?? "-"} · {row.reason}</div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold mb-1">건너뛴 행</div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {bulkSaveReport.skippedRows.length === 0 && <div>없음</div>}
                        {bulkSaveReport.skippedRows.map((row) => (
                          <div key={`skipped-${row.rowNumber}`}>{row.rowNumber}행 · {row.word ?? "-"} · {row.reason}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              </div>

              <div className="rounded-3xl border border-border bg-background/70 p-5">
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
              {uploadReport && (
                <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-sm space-y-3">
                  <div className="font-bold text-foreground">업로드 결과</div>
                  <div className="text-xs text-muted-foreground">
                    추가 {uploadReport.insertedCount}개 · 중복 건너뜀 {uploadReport.skippedCount}개 · 실패 {uploadReport.failedRows.length}개
                  </div>
                  <div>
                    <div className="font-semibold mb-1">생성된 세션</div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      {uploadReport.createdSessions.length === 0 && <div>없음</div>}
                      {uploadReport.createdSessions.map((session) => (
                        <div key={session.id}>{getSessionDisplayName(session)}</div>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="font-semibold mb-1">실패 행</div>
                      <div className="text-xs text-muted-foreground space-y-1 max-h-40 overflow-y-auto">
                        {uploadReport.failedRows.length === 0 && <div>없음</div>}
                        {uploadReport.failedRows.map((row) => (
                          <div key={`import-failed-${row.rowNumber}`}>{row.rowNumber}행 · {row.word ?? "-"} · {row.reason}</div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold mb-1">건너뛴 행</div>
                      <div className="text-xs text-muted-foreground space-y-1 max-h-40 overflow-y-auto">
                        {uploadReport.skippedRows.length === 0 && <div>없음</div>}
                        {uploadReport.skippedRows.map((row) => (
                          <div key={`import-skipped-${row.rowNumber}`}>{row.rowNumber}행 · {row.word ?? "-"} · {row.reason}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {imageFetchResults.length > 0 && (
        <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="font-bold text-foreground">이미지 수집 결과</div>
          <div className="grid gap-2 md:grid-cols-2">
            {imageFetchResults.map((row, index) => (
              <div key={`${row.word}-${index}`} className="rounded-xl border border-border p-3 text-sm">
                <div className="font-semibold text-foreground">{row.word}</div>
                <div className="text-xs text-muted-foreground mt-1">상태: {row.status}</div>
                <div className="text-xs text-muted-foreground">검색어: {row.query || "-"}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-[28px] border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="font-bold text-foreground">세션 어휘 목록</div>
          {sessionLoading && <Loader2 size={16} className="animate-spin text-primary" />}
        </div>
        {sessionLoadError && (
          <div className="flex items-center justify-between gap-3 border-b border-destructive/20 bg-destructive/5 px-4 py-3 text-sm">
            <div className="text-destructive">{sessionLoadError}</div>
            <button onClick={() => selectedSessionId && void getVocabSessionWords(selectedSessionId).then(setWords).catch((error) => setSessionLoadError(String(error)))} className="font-bold text-primary hover:underline">
              다시 시도
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-[60px_140px_minmax(240px,1fr)_90px_96px] text-sm">
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
                  <button onClick={() => startEditingWord(word)} className="mr-2 text-primary hover:underline text-xs font-bold">
                    <Pencil size={14} className="inline" />
                  </button>
                  <button
                    onClick={() => void handleRefreshWordImage(word)}
                    className="mr-2 text-primary hover:underline text-xs font-bold"
                    title="이미지 다시 찾기"
                  >
                    {refreshingImageWord === word.word ? <Loader2 size={14} className="inline animate-spin" /> : <ImageDown size={14} className="inline" />}
                  </button>
                  <button onClick={() => void handleDeleteWord(word.id)} className="text-destructive hover:underline text-xs font-bold">
                    <Trash2 size={14} className="inline" />
                  </button>
                </div>

                {isExpanded && (
                  <div className="col-span-5 bg-muted/30 px-6 py-4 border-b border-border/50 text-xs space-y-2">
                    {editingWordId === word.id ? (
                      <div className="space-y-2">
                        <input value={editForm.word} onChange={(event) => setEditForm((prev) => ({ ...prev, word: event.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2" placeholder="어휘" />
                        <input value={editForm.meaning} onChange={(event) => setEditForm((prev) => ({ ...prev, meaning: event.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2" placeholder="뜻" />
                        <input value={editForm.example} onChange={(event) => setEditForm((prev) => ({ ...prev, example: event.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2" placeholder="예문" />
                        <input value={editForm.relatedWords} onChange={(event) => setEditForm((prev) => ({ ...prev, relatedWords: event.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2" placeholder="관련어(쉼표 구분)" />
                        <div className="flex gap-2">
                          <button onClick={() => void handleSaveEdit(word.id)} disabled={savingEdit} className="rounded-lg bg-primary px-3 py-2 font-bold text-primary-foreground">
                            {savingEdit ? "저장 중..." : "저장"}
                          </button>
                          <button onClick={() => setEditingWordId(null)} className="rounded-lg border border-border px-3 py-2 font-bold text-foreground">
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div><strong>예문:</strong> {word.examples[0] || "(없음)"}</div>
                        <div><strong>관련어(L3):</strong> {word.relatedWords.join(", ") || "(없음)"}</div>
                        <div><strong>L4 (음절선택):</strong> 정답: {word.l4.answer}, 보기: {word.l4.options.join(", ")}</div>
                        <div><strong>L5 (어절조립):</strong> {word.l5.chunks.join(" / ") || "(없음)"}</div>
                        <div><strong>이미지 검수:</strong> {hasImage ? "현재 이미지가 연결되어 있습니다. ‘이미지 다시 찾기’로 즉시 교체를 확인할 수 있습니다." : "아직 이미지가 없습니다. 상단 수집 버튼 또는 다시 찾기를 사용하세요."}</div>
                      </>
                    )}
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
        </div>
      </section>
    </div>
  );
};

export default VocabManagement;
