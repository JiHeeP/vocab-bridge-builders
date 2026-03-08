import React, { useState } from 'react';
import { Users, Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';

interface StudentData {
  id: string;
  name: string;
  is_multicultural: boolean;
  grade_class: string;
}

interface Props {
  students: StudentData[];
  onRefresh: () => void;
}

const StudentManagement: React.FC<Props> = ({ students, onRefresh }) => {
  const [newName, setNewName] = useState('');
  const [newMulti, setNewMulti] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editMulti, setEditMulti] = useState(false);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const { error } = await supabase.from('students').insert({ name: newName.trim(), is_multicultural: newMulti });
    if (error) {
      toast({ title: '추가 실패', description: error.message, variant: 'destructive' });
    } else {
      setNewName('');
      setNewMulti(false);
      onRefresh();
      toast({ title: '학생 추가 완료' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 학생을 삭제하시겠습니까?')) return;
    await supabase.from('students').delete().eq('id', id);
    onRefresh();
  };

  const startEdit = (s: StudentData) => {
    setEditingId(s.id);
    setEditName(s.name);
    setEditMulti(s.is_multicultural);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await supabase.from('students').update({ name: editName.trim(), is_multicultural: editMulti }).eq('id', editingId);
    setEditingId(null);
    onRefresh();
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-6">
      <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
        <Users size={20} className="text-primary" /> 학생 관리
      </h3>

      {/* Add new student */}
      <div className="flex items-center gap-3 mb-4 p-3 bg-muted rounded-xl">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="학생 이름"
          className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <label className="flex items-center gap-2 text-sm text-foreground whitespace-nowrap">
          <Checkbox checked={newMulti} onCheckedChange={(v) => setNewMulti(!!v)} />
          다문화
        </label>
        <button onClick={handleAdd} className="bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm font-bold hover:bg-primary/90 flex items-center gap-1">
          <Plus size={16} /> 추가
        </button>
      </div>

      {/* Student list */}
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {students.map(s => (
          <div key={s.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
            {editingId === s.id ? (
              <>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground"
                />
                <label className="flex items-center gap-2 text-sm text-foreground whitespace-nowrap">
                  <Checkbox checked={editMulti} onCheckedChange={(v) => setEditMulti(!!v)} />
                  다문화
                </label>
                <button onClick={handleSaveEdit} className="text-success p-1"><Check size={16} /></button>
                <button onClick={() => setEditingId(null)} className="text-muted-foreground p-1"><X size={16} /></button>
              </>
            ) : (
              <>
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-sm">
                  {s.name[0]}
                </div>
                <span className="flex-1 font-bold text-foreground text-sm">{s.name}</span>
                {s.is_multicultural && (
                  <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">다문화</span>
                )}
                <button onClick={() => startEdit(s)} className="text-muted-foreground hover:text-foreground p-1"><Edit2 size={14} /></button>
                <button onClick={() => handleDelete(s.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 size={14} /></button>
              </>
            )}
          </div>
        ))}
        {students.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">등록된 학생이 없습니다.</p>
        )}
      </div>
    </div>
  );
};

export default StudentManagement;
