import React, { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { VOCAB_CATEGORY_LABELS, VOCAB_SUBJECTS, type VocabCategory, type VocabSubject } from "@/lib/vocabConstants";
import { createVocabSession, getSessionDisplayName, type VocabSession } from "@/lib/vocabData";
import { toast } from "@/hooks/use-toast";

interface Props {
  onSessionCreated: (session: VocabSession) => void;
}

const SessionCreationForm: React.FC<Props> = ({ onSessionCreated }) => {
  const [form, setForm] = useState({
    category: "tool" as VocabCategory,
    subject: "국어" as VocabSubject,
    sessionNo: "",
    label: "",
  });
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);

    try {
      const created = await createVocabSession({
        category: form.category,
        subject: form.category === "content" ? form.subject : null,
        sessionNo: Number(form.sessionNo),
        label: form.label.trim() || undefined,
      });

      setForm((prev) => ({ ...prev, sessionNo: "", label: "" }));
      toast({ title: "세션이 생성되었습니다", description: getSessionDisplayName(created) });
      onSessionCreated(created);
    } catch (error) {
      toast({ title: "세션 생성 실패", description: String(error), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
        <Plus size={16} className="text-primary" /> 세션 생성
      </div>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <select
          value={form.category}
          onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as VocabCategory }))}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="tool">{VOCAB_CATEGORY_LABELS.tool}</option>
          <option value="content">{VOCAB_CATEGORY_LABELS.content}</option>
        </select>
        <select
          value={form.subject}
          onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value as VocabSubject }))}
          disabled={form.category !== "content"}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
        >
          {VOCAB_SUBJECTS.map((subject) => (
            <option key={subject} value={subject}>
              {subject}
            </option>
          ))}
        </select>
        <input
          value={form.sessionNo}
          onChange={(e) => setForm((prev) => ({ ...prev, sessionNo: e.target.value }))}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
          placeholder="세션 번호"
          inputMode="numeric"
        />
        <input
          value={form.label}
          onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
          placeholder="라벨 (선택)"
        />
        <button
          type="submit"
          disabled={creating}
          className="md:col-span-4 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          세션 만들기
        </button>
      </form>
    </div>
  );
};

export default SessionCreationForm;
