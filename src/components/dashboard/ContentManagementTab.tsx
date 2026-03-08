import React, { useState } from "react";
import { BookOpen } from "lucide-react";
import StudentManagement from "./StudentManagement";
import VocabManagement from "./VocabManagement";

interface StudentData {
  id: string;
  name: string;
  is_multicultural: boolean;
  grade_class: string;
}

interface Props {
  students: StudentData[];
  onRefreshStudents: () => void;
}

const ContentManagementTab: React.FC<Props> = ({ students, onRefreshStudents }) => {
  const [showVocabManagement, setShowVocabManagement] = useState(false);

  if (showVocabManagement) {
    return <VocabManagement onBack={() => setShowVocabManagement(false)} />;
  }

  return (
    <div className="space-y-6">
      <StudentManagement students={students} onRefresh={onRefreshStudents} />

      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
          <BookOpen size={20} className="text-primary" /> 콘텐츠 관리
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => setShowVocabManagement(true)}
            className="flex items-center gap-4 p-5 rounded-2xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <BookOpen size={24} className="text-primary" />
            </div>
            <div>
              <div className="font-bold text-foreground">어휘 관리</div>
              <div className="text-sm text-muted-foreground">세션, 수동 어휘, 엑셀 업로드, 이미지 상태를 관리합니다.</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContentManagementTab;
