import React from "react";
import { Layers3 } from "lucide-react";
import { VOCAB_CATEGORY_LABELS, VOCAB_SUBJECTS, type VocabCategory, type VocabSubject } from "@/lib/vocabConstants";
import { type VocabSession } from "@/lib/vocabData";

interface Props {
  selectedCategory: VocabCategory;
  onCategoryChange: (category: VocabCategory) => void;
  selectedSubject: VocabSubject | null;
  onSubjectChange: (subject: VocabSubject) => void;
  visibleSessions: VocabSession[];
  selectedSessionId: string;
  onSessionSelect: (sessionId: string) => void;
  onSessionToggle: (session: VocabSession) => void;
}

const SessionFilter: React.FC<Props> = ({
  selectedCategory,
  onCategoryChange,
  selectedSubject,
  onSubjectChange,
  visibleSessions,
  selectedSessionId,
  onSessionSelect,
  onSessionToggle,
}) => {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border p-4">
        <div className="text-sm font-bold text-foreground mb-3">세션 필터</div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {(["tool", "content"] as VocabCategory[]).map((category) => (
            <button
              key={category}
              onClick={() => onCategoryChange(category)}
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
            onChange={(event) => onSubjectChange(event.target.value as VocabSubject)}
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
              <button onClick={() => onSessionSelect(session.id)} className="w-full text-left">
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
                  onClick={() => onSessionToggle(session)}
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
  );
};

export default SessionFilter;
