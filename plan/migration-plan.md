# Supabase → Railway PostgreSQL + Express 마이그레이션

## Context
- Supabase 무료 프로젝트 2개 한도 도달, 추가 결제 원치 않음
- Railway Hobby 플랜 결제 완료 → PostgreSQL 플러그인 무료 포함
- Supabase 제거 → Express 백엔드 + Railway PostgreSQL로 전환
- 프론트엔드도 같은 Express 서버에서 정적 파일 서빙 (별도 서비스 불필요)

---

## 아키텍처 변경

```
[현재]  브라우저 → Supabase (REST API + DB + Edge Function)

[변경]  브라우저 → Express 서버 (Railway) → PostgreSQL (Railway)
                    ├── /api/* (DB 조작)
                    └── /* (정적 파일 서빙 + SPA fallback)
```

**장점:** 한 서비스에서 프론트+백엔드+DB 모두 처리. Railway 하나로 끝.

---

## 수정/생성할 파일

### 신규 생성
| 파일 | 설명 |
|------|------|
| `server/index.ts` | Express 메인 서버 (포트, CORS, 정적 파일 서빙) |
| `server/db.ts` | PostgreSQL 연결 (pg Pool) |
| `server/routes/students.ts` | 학생 CRUD API |
| `server/routes/learningRecords.ts` | 학습 기록 API |
| `server/routes/interventionLogs.ts` | 중재 기록 API |
| `server/routes/wordImages.ts` | 단어 이미지 API |

### 수정
| 파일 | 변경 내용 |
|------|-----------|
| `src/lib/scoreService.ts` | supabase 호출 → fetch('/api/...') |
| `src/lib/wordImageService.ts` | supabase 호출 → fetch('/api/...') |
| `src/components/dashboard/StudentManagement.tsx` | supabase 호출 → fetch('/api/...') |
| `src/components/dashboard/VocabManagement.tsx` | supabase edge function → fetch('/api/...') |
| `src/pages/DashboardPage.tsx` | supabase 호출 → fetch('/api/...') |
| `package.json` | express, pg, cors, tsx 추가 / serve, @supabase/supabase-js 제거 |
| `railway.json` | 빌드: vite build, 스타트: tsx server/index.ts |
| `.env` | Supabase 변수 → DATABASE_URL |

### 삭제
| 파일 | 이유 |
|------|------|
| `src/integrations/supabase/client.ts` | 더 이상 필요 없음 |
| `src/integrations/supabase/types.ts` | 더 이상 필요 없음 |
| `supabase/` 폴더 전체 | Edge Function, config 불필요 |

---

## Express API 엔드포인트 (14개)

### Students
| Method | Route | 설명 |
|--------|-------|------|
| GET | `/api/students` | 전체 학생 목록 (order by name) |
| POST | `/api/students` | 학생 추가 |
| PUT | `/api/students/:id` | 학생 수정 |
| DELETE | `/api/students/:id` | 학생 삭제 |
| POST | `/api/students/get-or-create` | 이름으로 조회, 없으면 생성 |

### Learning Records
| Method | Route | 설명 |
|--------|-------|------|
| GET | `/api/learning-records` | 전체 학습 기록 |
| GET | `/api/learning-records?studentId=&from=&to=` | 학생별/기간별 필터 |
| POST | `/api/learning-records` | 학습 기록 일괄 저장 |
| GET | `/api/learning-records/group?gradeClass=&from=&to=` | 그룹 리포트 (학생 JOIN) |

### Word Images
| Method | Route | 설명 |
|--------|-------|------|
| GET | `/api/word-images?words=w1,w2` | 단어별 이미지 조회 |
| GET | `/api/word-images/list` | 이미지 있는 단어 목록 |
| POST | `/api/word-images/fetch` | 이미지 가져오기 (Unsplash+번역) — Edge Function 대체 |

### Intervention Logs
| Method | Route | 설명 |
|--------|-------|------|
| GET | `/api/intervention-logs?studentId=` | 중재 기록 조회 |
| POST | `/api/intervention-logs` | 중재 기록 추가 |

---

## 프론트엔드 API 호출 패턴

기존 Supabase 호출을 아래 패턴으로 통일:
```typescript
// 기존 (supabase)
const { data } = await supabase.from('students').select('*').order('name');

// 변경 (fetch)
const res = await fetch('/api/students');
const data = await res.json();
```

공통 API 헬퍼 함수 생성 (`src/lib/api.ts`):
```typescript
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

---

## Railway 배포 구조

```json
// railway.json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && npm run build"
  },
  "deploy": {
    "startCommand": "npx tsx server/index.ts",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

Express 서버가 `dist/` 정적 파일도 서빙 → SPA fallback 포함.

### Railway 환경변수
```
DATABASE_URL=postgresql://... (Railway PostgreSQL 플러그인이 자동 제공)
PORT=3000 (Railway가 자동 주입)
```

### Railway 설정 순서
1. Railway 대시보드 → 프로젝트에 **PostgreSQL 플러그인 추가**
2. PostgreSQL의 `DATABASE_URL`이 서비스에 자동 연결됨
3. Express 서버 첫 실행 시 테이블 자동 생성 (마이그레이션 SQL 내장)

---

## 작업 순서

1. Express 서버 + DB 연결 코드 작성 (`server/`)
2. API 라우트 14개 구현
3. 프론트엔드 코드 수정 (supabase → fetch)
4. Supabase 관련 파일/의존성 제거
5. `railway.json`, `package.json`, `.env` 업데이트
6. 로컬 테스트 (PostgreSQL 로컬 또는 Railway 연결)
7. GitHub push → Railway 자동 배포

---

## 검증
1. `npm run build` → dist/ 생성 확인
2. `npx tsx server/index.ts` → Express 서버 로컬 실행
3. 학생 목록 로드, 학습 기록 저장/조회, 대시보드 리포트 확인
4. Railway 배포 후 전체 기능 테스트

---

# (참고) 프로젝트 전체 구조 분석: Vocab Bridge Builders (어휘의 징검다리)

## 목적
다문화 학생을 위한 한국어 어휘 학습 게임 웹 애플리케이션.
6단계 게임 기반 어휘 학습 + 교사 대시보드(학습 결과 분석, 콘텐츠/학생 관리).

---

## 기술 스택
| 영역 | 기술 |
|------|------|
| 프레임워크 | React 18 + TypeScript + Vite |
| UI | shadcn/ui (Radix UI) + Tailwind CSS |
| 상태관리 | React Query (TanStack) + React Hooks |
| 라우팅 | React Router v6 |
| **데이터 저장** | **Supabase (PostgreSQL)** — 학생, 학습기록, 중재기록, 단어이미지 |
| 어휘 데이터 원본 | CSV 파일 (`public/data/vocab_review_checklist_filled.csv`) |
| 서버리스 함수 | Supabase Edge Function (Deno) — Unsplash 이미지 + Gemini AI 번역 |
| 패키지 매니저 | Bun |

---

## 정보 저장 방식 (? 해결)

**Supabase (PostgreSQL 클라우드 DB)** 를 사용하며, 4개 테이블로 구성:

| 테이블 | 용도 | 주요 필드 |
|--------|------|-----------|
| `students` | 학생 정보 | name, is_multicultural, grade_class |
| `learning_records` | 학습 기록 | student_id, word_id, stage_results(JSON), total_score, error_rate, tier |
| `intervention_logs` | 교사 중재 기록 | student_id, intervention_type, focus_words(JSON), before/after_error_rate |
| `word_images` | 단어별 이미지 캐시 | word(UNIQUE), image_url, photographer 정보 |

- 어휘 원본 데이터는 CSV 파일에서 로드 → 메모리 캐싱
- Supabase 세션은 localStorage에 저장
- 인증 시스템 없음 (URL 파라미터로 학생 식별, 대시보드 접근 제한 없음)
- RLS 정책은 모두 허용(permissive) 상태

---

## 폴더 구조

```
src/
├── pages/
│   ├── Index.tsx              # 홈 — 학생 이름 선택
│   ├── LearningPage.tsx       # 학생 학습 페이지 (세트 선택 → 6단계 게임)
│   ├── DashboardPage.tsx      # 교사 대시보드
│   └── NotFound.tsx           # 404
│
├── components/
│   ├── games/                 # 6단계 게임 컴포넌트
│   │   ├── Step01Card.tsx         # 1단계: 멀티모달 카드 (형태×수용)
│   │   ├── Step02Matching.tsx     # 2단계: N+2 매칭 (형태·의미×수용)
│   │   ├── Step03RelatedWords.tsx # 3단계: 관련어 선택 (의미×수용)
│   │   ├── Step04SyllableBlock.tsx# 4단계: 음절 블록 조립 (형태×산출)
│   │   ├── Step05VocabQuiz.tsx    # 5단계: 퀴즈+문장 채우기 (의미·사용×산출)
│   │   └── Step06VocabShower.tsx  # 6단계: 어휘 샤워 (의미×자동화)
│   │
│   ├── dashboard/             # 교사 대시보드 하위 컴포넌트
│   │   ├── ContentManagementTab.tsx  # 콘텐츠/학생 관리 탭
│   │   ├── StudentManagement.tsx     # 학생 CRUD
│   │   └── VocabManagement.tsx       # 어휘 콘텐츠 관리
│   │
│   ├── ui/                    # shadcn/ui 컴포넌트 (60+ 파일)
│   └── NavLink.tsx
│
├── lib/                       # 유틸리티/서비스
│   ├── vocabData.ts           # CSV 파싱, 어휘 데이터 관리
│   ├── scoreService.ts        # 점수 계산, Supabase DB 조작
│   ├── gameUtils.ts           # TTS, 효과음 등 게임 유틸
│   ├── wordImageService.ts    # 단어 이미지 캐시/조회
│   └── utils.ts               # 일반 유틸 (cn 함수 등)
│
├── hooks/
│   ├── use-toast.ts           # 토스트 알림
│   └── use-mobile.tsx         # 모바일 감지
│
├── integrations/supabase/
│   ├── client.ts              # Supabase 클라이언트 초기화
│   └── types.ts               # 자동 생성 DB 타입
│
└── App.tsx                    # 라우터 설정

public/data/
└── vocab_review_checklist_filled.csv  # 어휘 데이터셋 (200+ 단어)

supabase/
├── config.toml                # Supabase 프로젝트 설정
├── migrations/                # DB 마이그레이션 SQL 2개
└── functions/fetch-word-images/index.ts  # Edge Function (Unsplash+Gemini)
```

---

## 라우팅

| 경로 | 컴포넌트 | 설명 |
|------|----------|------|
| `/` | Index | 학생 이름 선택 화면 |
| `/learn?student=<이름>` | LearningPage | 세트 선택 → 6단계 게임 |
| `/dashboard` | DashboardPage | 교사 대시보드 (콘텐츠 관리 + 결과 분석) |

---

## 학습 흐름 & 점수 체계

- 어휘는 10개씩 세트로 그룹화
- 2~5단계에서 단어당 0/1/2점 채점 (6단계는 자동화 훈련)
- 오류율 = `(1 - totalScore/maxScore) × 100`
- Tier 분류: Acquired(≤20%) → Developing(20-35%) → Tier2(35-50%) → Tier3(>50%)
- 2단계 이상 완료 시 자동 저장

---

## 교사 대시보드 기능
- **콘텐츠 관리**: 학생 추가/수정/삭제, 다문화 여부 표시, 어휘 이미지 관리
- **개인 리포트**: 학생별 점수, 오류율, 단어별 티어, 중재 대상 단어 식별
- **그룹 리포트**: 다문화 vs 일반 학생 비교 분석, 단계별 격차, 공통 취약 단어
- **중재 기록**: 중재 유형, 집중 단어, 전후 오류율 비교
