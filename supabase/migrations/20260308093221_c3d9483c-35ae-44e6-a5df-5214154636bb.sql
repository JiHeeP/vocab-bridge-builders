-- 학생 테이블
CREATE TABLE public.students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  grade_class TEXT NOT NULL DEFAULT '3-2',
  is_multicultural BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to students" ON public.students FOR ALL USING (true) WITH CHECK (true);

-- 학습 기록 테이블
CREATE TABLE public.learning_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  word_id INTEGER NOT NULL,
  word_text TEXT NOT NULL,
  set_index INTEGER NOT NULL,
  stage_results JSONB NOT NULL DEFAULT '[]',
  total_score INTEGER NOT NULL DEFAULT 0,
  max_score INTEGER NOT NULL DEFAULT 8,
  error_rate NUMERIC(5,1) NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'acquired' CHECK (tier IN ('acquired', 'developing', 'tier2', 'tier3')),
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.learning_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to learning_records" ON public.learning_records FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_learning_records_student ON public.learning_records(student_id);
CREATE INDEX idx_learning_records_created ON public.learning_records(created_at);
CREATE INDEX idx_learning_records_word ON public.learning_records(word_id);

-- 개입 로그 테이블
CREATE TABLE public.intervention_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  intervention_type TEXT NOT NULL DEFAULT 'tier2_small_group',
  focus_words JSONB NOT NULL DEFAULT '[]',
  duration_min INTEGER NOT NULL DEFAULT 0,
  before_error_rate NUMERIC(5,1),
  after_error_rate NUMERIC(5,1),
  memo TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.intervention_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to intervention_logs" ON public.intervention_logs FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_intervention_logs_student ON public.intervention_logs(student_id);