// Types
export interface VocabWord {
  id: number;
  word: string;
  meaning: string;
  examples: string[];
  relatedWords: string[];
  l4: {
    answer: string;
    options: string[]; // syllables including distractors
  };
  l5: {
    chunks: string[];
    targetIndex: number;
    vocabDistractor: string;
    hints: string[];
    fullDistractors: string[];
  };
}

export interface VocabSet {
  setIndex: number;
  label: string;
  words: VocabWord[];
}

// Parse CSV row fields
function parseRelatedWords(field: string): string[] {
  if (!field) return [];
  // Remove surrounding quotes if present
  const cleaned = field.replace(/^"|"$/g, '').trim();
  return cleaned.split(',').map(w => w.trim()).filter(Boolean);
}

function parseL4(field: string): { answer: string; options: string[] } {
  // Format: "정답:움직임 | 보기:움/측/차/직/임"
  const parts = field.split('|').map(p => p.trim());
  let answer = '';
  let options: string[] = [];
  for (const part of parts) {
    if (part.startsWith('정답:')) {
      answer = part.replace('정답:', '').trim();
    } else if (part.startsWith('보기:')) {
      options = part.replace('보기:', '').trim().split('/').map(s => s.trim());
    }
  }
  return { answer, options };
}

function parseL5(field: string): VocabWord['l5'] {
  // Format: "chunks:나는/수업 시간에/움직임을/배웠다. | targetIndex:2 | vocabDistractor:짐작을 | hints:누가?/언제/어디서?/무엇을?/어찌했나? | fullDistractors:움직임이,잊어버렸다."
  const parts = field.split(' | ').map(p => p.trim());
  let chunks: string[] = [];
  let targetIndex = 0;
  let vocabDistractor = '';
  let hints: string[] = [];
  let fullDistractors: string[] = [];

  for (const part of parts) {
    if (part.startsWith('chunks:')) {
      chunks = part.replace('chunks:', '').trim().split('/').map(s => s.trim());
    } else if (part.startsWith('targetIndex:')) {
      targetIndex = parseInt(part.replace('targetIndex:', '').trim(), 10);
    } else if (part.startsWith('vocabDistractor:')) {
      vocabDistractor = part.replace('vocabDistractor:', '').trim();
    } else if (part.startsWith('hints:')) {
      // Split by "/" but merge items that don't end with "?" with the next
      const rawHints = part.replace('hints:', '').trim().split('/');
      const merged: string[] = [];
      let buffer = '';
      for (const h of rawHints) {
        if (buffer) {
          merged.push(buffer + '/' + h);
          buffer = '';
        } else if (!h.endsWith('?')) {
          buffer = h;
        } else {
          merged.push(h);
        }
      }
      if (buffer) merged.push(buffer);
      hints = merged;
    } else if (part.startsWith('fullDistractors:')) {
      fullDistractors = part.replace('fullDistractors:', '').trim().split(',').map(s => s.trim());
    }
  }

  return { chunks, targetIndex, vocabDistractor, hints, fullDistractors };
}

// Parse CSV text to VocabWord[]
function parseCSV(csvText: string): VocabWord[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  const words: VocabWord[] = [];

  for (let i = 1; i < lines.length; i++) {
    // CSV parsing with quoted fields
    const fields = parseCSVLine(lines[i]);
    if (fields.length < 11) continue;

    const id = parseInt(fields[0], 10);
    if (isNaN(id)) continue;

    const word = fields[2].trim(); // 표기통일
    const meaning = fields[3].trim();
    const examples = [fields[4], fields[5], fields[6]].map(e => e.trim()).filter(Boolean);
    const relatedWords = parseRelatedWords(fields[8]);
    const l4 = parseL4(fields[9]);
    const l5 = parseL5(fields[10]);

    words.push({ id, word, meaning, examples, relatedWords, l4, l5 });
  }

  return words;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

// Group words into sets of 10
export function groupIntoSets(words: VocabWord[], setSize: number = 10): VocabSet[] {
  const sets: VocabSet[] = [];
  for (let i = 0; i < words.length; i += setSize) {
    const setWords = words.slice(i, i + setSize);
    if (setWords.length === 0) break;
    const setIndex = Math.floor(i / setSize);
    sets.push({
      setIndex,
      label: `세트 ${setIndex + 1}`,
      words: setWords,
    });
  }
  return sets;
}

// Generate "bad" (unrelated) words for Step 3 and Step 6
// Pick from other words' names that are NOT in the current word's related list
export function generateBadWords(
  currentWord: VocabWord,
  allWords: VocabWord[],
  count: number = 4
): string[] {
  const related = new Set([currentWord.word, ...currentWord.relatedWords]);
  const candidates = allWords
    .filter(w => !related.has(w.word))
    .map(w => w.word);

  // Shuffle and pick
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Fetch and parse CSV data
let cachedWords: VocabWord[] | null = null;
let cachedSets: VocabSet[] | null = null;

export async function loadVocabData(): Promise<{ words: VocabWord[]; sets: VocabSet[] }> {
  if (cachedWords && cachedSets) {
    return { words: cachedWords, sets: cachedSets };
  }

  const response = await fetch('/data/vocab_review_checklist_filled.csv');
  const text = await response.text();
  const words = parseCSV(text);
  const sets = groupIntoSets(words);

  cachedWords = words;
  cachedSets = sets;

  return { words, sets };
}

// Utility: shuffle array
export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Utility: pick random items
export function pick<T>(arr: T[], count: number): T[] {
  return shuffle(arr).slice(0, count);
}

// Get emoji icon for a word (simple mapping based on meaning keywords)
export function getWordEmoji(word: string): string {
  const emojiMap: Record<string, string> = {
    '움직임': '🏃', '방식': '📋', '영향': '💫', '환경': '🌳', '재다': '📏',
    '측정': '🔬', '추측': '🤔', '단서': '🔍', '짐작': '💭', '계획': '📝',
    '개요': '📑', '보존': '🛡️', '조사': '🔎', '실행': '▶️', '파악': '👁️',
    '공통점': '🤝', '차이점': '↔️', '비교': '⚖️', '입체': '🧊', '구하다': '🔧',
    '해결': '✅', '반대': '🔄', '문제점': '⚠️', '바람직하다': '👍', '작품': '🎨',
    '제출': '📤', '점검': '✔️', '태도': '🙋', '상상': '🌈', '관점': '👀',
    '재구성': '🔨', '배경': '🖼️', '창의적': '💡', '분류': '📂', '기준': '📐',
    '도구': '🔧', '나누다': '✂️', '묶다': '🪢', '표면': '🪟', '확대': '🔍',
    '대상': '🎯', '작성': '✍️', '변화': '🦋', '탐색': '🧭', '참고': '📖',
    '예상': '🔮', '결과': '📊', '평균': '➗', '단순': '⭕', '구조': '🏗️',
    '불가능': '🚫', '수단': '🛠️', '대부분': '📈', '정확히': '🎯', '비슷하다': '≈',
    '특징': '⭐', '반면': '↩️', '형태': '🔷', '구별': '🔀', '연결': '🔗',
    '요소': '🧩', '선택': '☝️', '간추리다': '📝', '적절하다': '👌', '판단': '⚖️',
    '검토': '🧐', '고려': '🤨', '장단점': '➕', '사례': '📋', '어렵다': '😰',
    '원인': '❓', '효과적': '🎯', '까닭': '❓', '역할': '🎭', '자료': '📁',
    '정하다': '📌', '참여': '🙌', '연구': '🔬', '기술': '⚙️', '번갈다': '🔄',
    '설명': '🗣️', '관찰': '👁️', '주제': '📚', '표시': '📍', '의미': '💬',
    '상황': '🎬', '내용': '📖', '짜임': '🧱', '알아보다': '🔎', '드러나다': '👀',
    '달라지다': '🔄', '구성': '🏗️', '모서리': '📐', '방법': '🗺️', '찬성': '👍',
    '보호': '🛡️', '전시': '🖼️', '평가': '📊', '범위': '📏', '순서': '🔢',
    '바꾸다': '🔁', '용액': '🧪', '설명하다': '💬', '정리': '🗂️', '완성': '🏆',
    '이용': '♻️', '의생활': '👕', '식생활': '🍽️', '주생활': '🏠', '기록': '📝',
    '적당하다': '👌', '성질': '🧬', '크기': '📐', '요약': '📋', '모두': '👥',
    '다르다': '≠', '모습': '👤', '부분': '🧩', '관련있다': '🔗', '맞다': '✓',
    '의견': '💬', '대비': '🔍', '보고': '📄', '떠오르다': '💡', '제시': '👉',
    '미래': '🔮', '발달': '📈',
  };
  return emojiMap[word] || '📝';
}

// Pastel colors for cards
const PASTEL_COLORS = [
  'e0f2fe', 'fef3c7', 'dcfce7', 'f3e8ff', 'ffedd5',
  'fee2e2', 'e0e7ff', 'ccfbf1', 'd1fae5', 'fce7f3',
];

export function getWordColor(index: number): string {
  return PASTEL_COLORS[index % PASTEL_COLORS.length];
}
