import fs from "node:fs/promises";
import path from "node:path";
import XLSX from "xlsx";
import { PoolClient } from "pg";
import { pool } from "../db";
import {
  DEFAULT_SESSION_LABEL,
  VOCAB_CATEGORY_LABELS,
  VOCAB_SUBJECTS,
  type VocabCategory,
  type VocabSubject,
} from "../../src/lib/vocabConstants";
import { vocabDictionary } from "../data/vocabDictionary";
import { generateL4Data, generateL5Data } from "./aiGenerationService";

export interface VocabStage4Data {
  answer: string;
  options: string[];
}

export interface VocabStage5Data {
  chunks: string[];
  targetIndex: number;
  vocabDistractor: string;
  hints: string[];
  fullDistractors: string[];
}

export interface VocabWordRecord {
  id: number;
  session_id: string;
  word: string;
  meaning: string;
  examples: string[];
  relatedWords: string[];
  l4: VocabStage4Data;
  l5: VocabStage5Data;
  displayOrder: number;
  sourceType: "manual" | "excel" | "bootstrap";
}

export interface VocabSessionSummary {
  id: string;
  category: VocabCategory;
  categoryLabel: string;
  subject: VocabSubject | null;
  sessionNo: number;
  label: string;
  isActive: boolean;
  wordCount: number;
}

interface ParsedCsvWord {
  id?: number;
  word: string;
  meaning: string;
  examples: string[];
  relatedWords: string[];
  l4: VocabStage4Data;
  l5: VocabStage5Data;
}

interface ImportedRowFailure {
  rowNumber: number;
  reason: string;
}

const IMPORT_SESSION_SIZE = 10;

interface CreateWordInput {
  sessionId: string;
  preferredId?: number;
  word: string;
  meaning: string;
  examples: string[];
  relatedWords: string[];
  l4: VocabStage4Data;
  l5: VocabStage5Data;
  displayOrder?: number;
  sourceType: "manual" | "excel" | "bootstrap";
  client?: PoolClient;
  usedIds?: Set<number>;
  nextIdRef?: { value: number };
}

const BOOTSTRAP_SESSION_SIZE = 10;
const CSV_HEADERS = {
  id: "ID",
  word: "표기통일",
  meaning: "뜻검수",
  example: "예문",
  // Legacy multi-example headers (backward compat)
  example1: "예문1",
  example2: "예문2",
  example3: "예문3",
  relatedWords: "관련어",
  relatedWords10: "관련어10",
  l4: "L4음절선택",
  l5: "L5어절조립",
};

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").trim();
}

function splitCsvRows(csvText: string): string[] {
  const rows: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      if (current.trim()) {
        rows.push(current);
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    rows.push(current);
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields;
}

function parseRelatedWords(field: string): string[] {
  if (!field) return [];
  return field
    .replace(/^"|"$/g, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseL4(field: string): VocabStage4Data {
  const parts = field.split("|").map((part) => part.trim());
  let answer = "";
  let options: string[] = [];

  for (const part of parts) {
    if (part.startsWith("정답:")) {
      answer = part.replace("정답:", "").trim();
    } else if (part.startsWith("보기:")) {
      options = part
        .replace("보기:", "")
        .split("/")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return { answer, options };
}

function parseL5(field: string): VocabStage5Data {
  const parts = field.split(" | ").map((part) => part.trim());
  let chunks: string[] = [];
  let targetIndex = 0;
  let vocabDistractor = "";
  let hints: string[] = [];
  let fullDistractors: string[] = [];

  for (const part of parts) {
    if (part.startsWith("chunks:")) {
      chunks = part
        .replace("chunks:", "")
        .split("/")
        .map((item) => item.trim())
        .filter(Boolean);
    } else if (part.startsWith("targetIndex:")) {
      targetIndex = Number.parseInt(part.replace("targetIndex:", "").trim(), 10);
    } else if (part.startsWith("vocabDistractor:")) {
      vocabDistractor = part.replace("vocabDistractor:", "").trim();
    } else if (part.startsWith("hints:")) {
      hints = part
        .replace("hints:", "")
        .split("/")
        .map((item) => item.trim())
        .filter(Boolean);
    } else if (part.startsWith("fullDistractors:")) {
      fullDistractors = part
        .replace("fullDistractors:", "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return { chunks, targetIndex, vocabDistractor, hints, fullDistractors };
}

function parseCsvText(csvText: string): ParsedCsvWord[] {
  const rows = splitCsvRows(csvText);
  if (rows.length < 2) return [];

  const headers = parseCsvLine(rows[0]).map(normalizeHeader);
  const indexByHeader = new Map(headers.map((header, index) => [header, index]));

  // Detect format: new single-example or legacy multi-example
  const hasNewExampleHeader = indexByHeader.has(CSV_HEADERS.example);
  const hasLegacyExampleHeaders = indexByHeader.has(CSV_HEADERS.example1);

  return rows.slice(1).flatMap((row) => {
    const fields = parseCsvLine(row);
    const word = fields[indexByHeader.get(CSV_HEADERS.word) ?? -1]?.trim() ?? "";
    const meaning = fields[indexByHeader.get(CSV_HEADERS.meaning) ?? -1]?.trim() ?? "";

    if (!word || !meaning) {
      return [];
    }

    const idField = fields[indexByHeader.get(CSV_HEADERS.id) ?? -1]?.trim() ?? "";
    const parsedId = Number.parseInt(idField, 10);

    // Parse examples: support both new (single 예문) and legacy (예문1/2/3) formats
    let examples: string[];
    if (hasNewExampleHeader) {
      const singleExample = fields[indexByHeader.get(CSV_HEADERS.example) ?? -1]?.trim() ?? "";
      examples = singleExample ? [singleExample] : [];
    } else if (hasLegacyExampleHeaders) {
      examples = [
        fields[indexByHeader.get(CSV_HEADERS.example1) ?? -1] ?? "",
        fields[indexByHeader.get(CSV_HEADERS.example2) ?? -1] ?? "",
        fields[indexByHeader.get(CSV_HEADERS.example3) ?? -1] ?? "",
      ]
        .map((item) => item.trim())
        .filter(Boolean);
    } else {
      examples = [];
    }

    // Parse relatedWords: support both "관련어" and legacy "관련어10"
    const relatedWordsField =
      fields[indexByHeader.get(CSV_HEADERS.relatedWords) ?? -1]?.trim() ??
      fields[indexByHeader.get(CSV_HEADERS.relatedWords10) ?? -1]?.trim() ??
      "";

    // Parse l4/l5: optional - empty if not provided
    const l4Field = fields[indexByHeader.get(CSV_HEADERS.l4) ?? -1]?.trim() ?? "";
    const l5Field = fields[indexByHeader.get(CSV_HEADERS.l5) ?? -1]?.trim() ?? "";

    return [
      {
        id: Number.isNaN(parsedId) ? undefined : parsedId,
        word,
        meaning,
        examples,
        relatedWords: parseRelatedWords(relatedWordsField),
        l4: l4Field ? parseL4(l4Field) : { answer: "", options: [] },
        l5: l5Field ? parseL5(l5Field) : { chunks: [], targetIndex: 0, vocabDistractor: "", hints: [], fullDistractors: [] },
      },
    ];
  });
}

function mapWordRow(row: {
  id: number;
  session_id: string;
  word: string;
  meaning: string;
  examples: string[];
  related_words: string[];
  l4: VocabStage4Data;
  l5: VocabStage5Data;
  display_order: number;
  source_type: "manual" | "excel" | "bootstrap";
}): VocabWordRecord {
  return {
    id: row.id,
    session_id: row.session_id,
    word: row.word,
    meaning: row.meaning,
    examples: Array.isArray(row.examples) ? row.examples : [],
    relatedWords: Array.isArray(row.related_words) ? row.related_words : [],
    l4: row.l4,
    l5: row.l5,
    displayOrder: row.display_order,
    sourceType: row.source_type,
  };
}

function mapSessionRow(row: {
  id: string;
  category: VocabCategory;
  subject: VocabSubject | null;
  session_no: number;
  label: string;
  is_active: boolean;
  word_count: number | string;
}): VocabSessionSummary {
  return {
    id: row.id,
    category: row.category,
    categoryLabel: VOCAB_CATEGORY_LABELS[row.category],
    subject: row.subject,
    sessionNo: row.session_no,
    label: row.label,
    isActive: row.is_active,
    wordCount: Number(row.word_count ?? 0),
  };
}

async function getUsedIds(client: PoolClient): Promise<Set<number>> {
  const result = await client.query<{ id: number }>("SELECT id FROM vocab_words");
  return new Set(result.rows.map((row) => row.id));
}

async function getNextWordId(client: PoolClient): Promise<number> {
  const result = await client.query<{ next_id: number }>(
    "SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM vocab_words",
  );
  return result.rows[0]?.next_id ?? 1;
}

async function resolveWordId(
  client: PoolClient,
  preferredId: number | undefined,
  usedIds: Set<number>,
  nextIdRef: { value: number },
): Promise<number> {
  if (preferredId !== undefined && !usedIds.has(preferredId)) {
    usedIds.add(preferredId);
    return preferredId;
  }

  let nextId = nextIdRef.value;
  while (usedIds.has(nextId)) {
    nextId += 1;
  }

  usedIds.add(nextId);
  nextIdRef.value = nextId + 1;
  return nextId;
}

async function getNextDisplayOrder(client: PoolClient, sessionId: string): Promise<number> {
  const result = await client.query<{ next_order: number }>(
    "SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM vocab_words WHERE session_id = $1",
    [sessionId],
  );
  return result.rows[0]?.next_order ?? 1;
}

export async function ensureBootstrapVocabData() {
  const counts = await pool.query<{ session_count: string; word_count: string }>(
    `
      SELECT
        (SELECT COUNT(*)::text FROM vocab_sessions) AS session_count,
        (SELECT COUNT(*)::text FROM vocab_words) AS word_count
    `,
  );

  const sessionCount = Number(counts.rows[0]?.session_count ?? 0);
  const wordCount = Number(counts.rows[0]?.word_count ?? 0);
  if (sessionCount > 0 || wordCount > 0) {
    return;
  }

  const csvPath = path.resolve(process.cwd(), "public", "data", "vocab_review_checklist_filled.csv");
  const csvText = await fs.readFile(csvPath, "utf8");
  const parsedWords = parseCsvText(csvText);
  if (parsedWords.length === 0) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (let start = 0; start < parsedWords.length; start += BOOTSTRAP_SESSION_SIZE) {
      const sessionWords = parsedWords.slice(start, start + BOOTSTRAP_SESSION_SIZE);
      const sessionNo = Math.floor(start / BOOTSTRAP_SESSION_SIZE) + 1;
      const sessionLabel = `${DEFAULT_SESSION_LABEL} ${sessionNo}`;

      const sessionInsert = await client.query<{ id: string }>(
        `
          INSERT INTO vocab_sessions (category, subject, session_no, label, is_active)
          VALUES ('tool', NULL, $1, $2, true)
          RETURNING id
        `,
        [sessionNo, sessionLabel],
      );

      const sessionId = sessionInsert.rows[0].id;

      for (let wordIndex = 0; wordIndex < sessionWords.length; wordIndex += 1) {
        const word = sessionWords[wordIndex];
        await client.query(
          `
            INSERT INTO vocab_words (
              id,
              session_id,
              word,
              meaning,
              examples,
              related_words,
              l4,
              l5,
              display_order,
              source_type
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, 'bootstrap')
          `,
          [
            word.id,
            sessionId,
            word.word,
            word.meaning,
            JSON.stringify(word.examples),
            JSON.stringify(word.relatedWords),
            JSON.stringify(word.l4),
            JSON.stringify(word.l5),
            wordIndex + 1,
          ],
        );
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getVocabCatalog(includeInactive = false): Promise<{ sessions: VocabSessionSummary[] }> {
  const conditions = includeInactive ? "" : "WHERE s.is_active = true";
  const result = await pool.query(
    `
      SELECT
        s.id,
        s.category,
        s.subject,
        s.session_no,
        s.label,
        s.is_active,
        COUNT(w.id)::int AS word_count
      FROM vocab_sessions s
      LEFT JOIN vocab_words w ON w.session_id = s.id
      ${conditions}
      GROUP BY s.id
      ORDER BY
        CASE s.category WHEN 'tool' THEN 0 ELSE 1 END,
        CASE s.subject
          WHEN '국어' THEN 0
          WHEN '수학' THEN 1
          WHEN '사회' THEN 2
          WHEN '과학' THEN 3
          WHEN '예체능' THEN 4
          WHEN '기타' THEN 5
          ELSE 99
        END,
        s.session_no ASC
    `,
  );

  return { sessions: result.rows.map(mapSessionRow) };
}

export async function getVocabSessionWords(sessionId: string): Promise<VocabWordRecord[]> {
  const result = await pool.query(
    `
      SELECT
        id,
        session_id,
        word,
        meaning,
        examples,
        related_words,
        l4,
        l5,
        display_order,
        source_type
      FROM vocab_words
      WHERE session_id = $1
      ORDER BY display_order ASC, id ASC
    `,
    [sessionId],
  );

  return result.rows.map(mapWordRow);
}

export async function createVocabSession(input: {
  category: VocabCategory;
  subject?: string | null;
  sessionNo: number;
  label?: string | null;
}): Promise<VocabSessionSummary> {
  if (!Number.isInteger(input.sessionNo) || input.sessionNo <= 0) {
    throw new Error("sessionNo must be a positive integer");
  }

  if (input.category === "content") {
    if (!input.subject || !VOCAB_SUBJECTS.includes(input.subject as VocabSubject)) {
      throw new Error("content sessions require a valid subject");
    }
  } else if (input.subject) {
    throw new Error("tool sessions cannot have a subject");
  }

  const label = input.label?.trim() || `${DEFAULT_SESSION_LABEL} ${input.sessionNo}`;
  const subject = input.category === "content" ? (input.subject as VocabSubject) : null;

  const result = await pool.query(
    `
      INSERT INTO vocab_sessions (category, subject, session_no, label, is_active)
      VALUES ($1, $2, $3, $4, true)
      RETURNING id, category, subject, session_no, label, is_active, 0::int AS word_count
    `,
    [input.category, subject, input.sessionNo, label],
  );

  return mapSessionRow(result.rows[0]);
}

export async function updateVocabSession(sessionId: string, input: { isActive: boolean }): Promise<VocabSessionSummary> {
  const result = await pool.query(
    `
      UPDATE vocab_sessions
      SET is_active = $2
      WHERE id = $1
      RETURNING id, category, subject, session_no, label, is_active,
        (SELECT COUNT(*)::int FROM vocab_words WHERE session_id = vocab_sessions.id) AS word_count
    `,
    [sessionId, input.isActive],
  );

  if (!result.rows[0]) {
    throw new Error("session not found");
  }

  return mapSessionRow(result.rows[0]);
}

export async function createVocabWord(input: CreateWordInput): Promise<VocabWordRecord> {
  const client = input.client ?? (await pool.connect());

  try {
    const ownClient = !input.client;
    if (ownClient) {
      await client.query("BEGIN");
    }

    const examples = input.examples.map((item) => item.trim()).filter(Boolean);
    const relatedWords = input.relatedWords.map((item) => item.trim()).filter(Boolean);
    const displayOrder = input.displayOrder ?? (await getNextDisplayOrder(client, input.sessionId));
    const usedIds = input.usedIds ?? (await getUsedIds(client));
    const nextIdRef = input.nextIdRef ?? { value: await getNextWordId(client) };
    const id = await resolveWordId(client, input.preferredId, usedIds, nextIdRef);

    const result = await client.query(
      `
        INSERT INTO vocab_words (
          id,
          session_id,
          word,
          meaning,
          examples,
          related_words,
          l4,
          l5,
          display_order,
          source_type
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10)
        RETURNING
          id,
          session_id,
          word,
          meaning,
          examples,
          related_words,
          l4,
          l5,
          display_order,
          source_type
      `,
      [
        id,
        input.sessionId,
        input.word.trim(),
        input.meaning.trim(),
        JSON.stringify(examples),
        JSON.stringify(relatedWords),
        JSON.stringify(input.l4),
        JSON.stringify(input.l5),
        displayOrder,
        input.sourceType,
      ],
    );

    if (ownClient) {
      await client.query("COMMIT");
    }

    return mapWordRow(result.rows[0]);
  } catch (error) {
    if (!input.client) {
      await client.query("ROLLBACK");
    }
    throw error;
  } finally {
    if (!input.client) {
      client.release();
    }
  }
}

async function getNextSessionNo(
  client: PoolClient,
  category: VocabCategory,
  subject: VocabSubject | null,
): Promise<number> {
  const result = await client.query<{ next_session_no: number }>(
    `
      SELECT COALESCE(MAX(session_no), 0) + 1 AS next_session_no
      FROM vocab_sessions
      WHERE category = $1
        AND COALESCE(subject, '') = COALESCE($2, '')
    `,
    [category, subject],
  );

  return result.rows[0]?.next_session_no ?? 1;
}

async function createImportSession(
  client: PoolClient,
  category: VocabCategory,
  subject: VocabSubject | null,
  sessionNo: number,
): Promise<VocabSessionSummary> {
  const label = `${DEFAULT_SESSION_LABEL} ${sessionNo}`;
  const result = await client.query(
    `
      INSERT INTO vocab_sessions (category, subject, session_no, label, is_active)
      VALUES ($1, $2, $3, $4, true)
      RETURNING id, category, subject, session_no, label, is_active, 0::int AS word_count
    `,
    [category, subject, sessionNo, label],
  );

  return mapSessionRow(result.rows[0]);
}

function parseSpreadsheet(buffer: Buffer, originalName: string): ParsedCsvWord[] {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === ".csv") {
    return parseCsvText(buffer.toString("utf8"));
  }

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }

  const sheet = workbook.Sheets[firstSheetName];
  const csvText = XLSX.utils.sheet_to_csv(sheet, { FS: ",", RS: "\n" });
  return parseCsvText(csvText);
}

export async function importVocabSpreadsheet(input: {
  category: VocabCategory;
  subject?: VocabSubject | null;
  buffer: Buffer;
  originalName: string;
}): Promise<{
  insertedCount: number;
  skippedCount: number;
  failedRows: ImportedRowFailure[];
  createdSessions: VocabSessionSummary[];
}> {
  if (input.category === "content") {
    if (!input.subject) {
      throw new Error("content import requires a subject");
    }
  } else if (input.subject) {
    throw new Error("tool session import cannot include subject");
  }

  const parsedRows = parseSpreadsheet(input.buffer, input.originalName);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const subject = input.category === "content" ? (input.subject ?? null) : null;
    const existingWords = await client.query<{ word: string }>(
      `
        SELECT w.word
        FROM vocab_words w
        JOIN vocab_sessions s ON s.id = w.session_id
        WHERE s.category = $1
          AND COALESCE(s.subject, '') = COALESCE($2, '')
      `,
      [input.category, subject],
    );
    const usedWords = new Set(existingWords.rows.map((row) => row.word.trim().toLowerCase()));
    const usedIds = await getUsedIds(client);
    const nextIdRef = { value: await getNextWordId(client) };
    const createdSessions: VocabSessionSummary[] = [];
    let nextSessionNo = await getNextSessionNo(client, input.category, subject);
    let currentSession: VocabSessionSummary | null = null;
    let currentSessionWordCount = 0;

    let insertedCount = 0;
    let skippedCount = 0;
    const failedRows: ImportedRowFailure[] = [];

    for (let index = 0; index < parsedRows.length; index += 1) {
      const row = parsedRows[index];
      const rowNumber = index + 2;
      const normalizedWord = row.word.trim().toLowerCase();

      if (!row.word || !row.meaning) {
        failedRows.push({ rowNumber, reason: "단어 또는 뜻이 비어 있습니다" });
        continue;
      }

      if (usedWords.has(normalizedWord)) {
        skippedCount += 1;
        continue;
      }

      try {
        if (!currentSession || currentSessionWordCount >= IMPORT_SESSION_SIZE) {
          currentSession = await createImportSession(client, input.category, subject, nextSessionNo);
          createdSessions.push(currentSession);
          currentSessionWordCount = 0;
          nextSessionNo += 1;
        }

        // Auto-fill l4/l5 if not provided in the CSV
        const l4 = row.l4.answer ? row.l4 : generateL4Data(row.word);
        const example = row.examples[0] || "";
        const l5 = row.l5.chunks.length > 0 ? row.l5 : generateL5Data(row.word, example, row.relatedWords);

        await createVocabWord({
          sessionId: currentSession.id,
          preferredId: row.id,
          word: row.word,
          meaning: row.meaning,
          examples: row.examples,
          relatedWords: row.relatedWords,
          l4,
          l5,
          displayOrder: currentSessionWordCount + 1,
          sourceType: "excel",
          client,
          usedIds,
          nextIdRef,
        });
        usedWords.add(normalizedWord);
        insertedCount += 1;
        currentSessionWordCount += 1;
      } catch (error) {
        failedRows.push({
          rowNumber,
          reason: error instanceof Error ? error.message : "failed to import row",
        });
      }
    }

    await client.query("COMMIT");
    return { insertedCount, skippedCount, failedRows, createdSessions };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function getAutoFillData(word: string): { meaning: string; examples: string[] } | null {
  return vocabDictionary[word] ?? null;
}

export async function refreshDefinitions(): Promise<{ updatedCount: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let updatedCount = 0;

    for (const [word, data] of Object.entries(vocabDictionary)) {
      const result = await client.query(
        `UPDATE vocab_words SET meaning = $1, examples = $2::jsonb WHERE word = $3`,
        [data.meaning, JSON.stringify(data.examples), word],
      );
      updatedCount += result.rowCount ?? 0;
    }

    await client.query("COMMIT");
    return { updatedCount };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
