import { Router } from "express";
import { pool } from "../db";

const router = Router();

router.get("/group", async (req, res, next) => {
  try {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (typeof req.query.gradeClass === "string" && req.query.gradeClass) {
      values.push(req.query.gradeClass);
      conditions.push(`s.grade_class = $${values.length}`);
    }

    if (typeof req.query.from === "string" && req.query.from) {
      values.push(req.query.from);
      conditions.push(`lr.created_at >= $${values.length}`);
    }

    if (typeof req.query.to === "string" && req.query.to) {
      values.push(req.query.to);
      conditions.push(`lr.created_at <= $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(
      `
        SELECT
          lr.*,
          json_build_object(
            'name', s.name,
            'is_multicultural', s.is_multicultural,
            'grade_class', s.grade_class
          ) AS student
        FROM learning_records lr
        JOIN students s ON s.id = lr.student_id
        ${whereClause}
        ORDER BY lr.created_at DESC
      `,
      values,
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (typeof req.query.studentId === "string" && req.query.studentId) {
      values.push(req.query.studentId);
      conditions.push(`student_id = $${values.length}`);
    }

    if (typeof req.query.from === "string" && req.query.from) {
      values.push(req.query.from);
      conditions.push(`created_at >= $${values.length}`);
    }

    if (typeof req.query.to === "string" && req.query.to) {
      values.push(req.query.to);
      conditions.push(`created_at <= $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(
      `
        SELECT *
        FROM learning_records
        ${whereClause}
        ORDER BY created_at DESC
      `,
      values,
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const records = Array.isArray(req.body) ? req.body : req.body?.records;

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).send("records array is required");
    }

    const insertedRows = [];

    for (const record of records) {
      const result = await pool.query(
        `
          INSERT INTO learning_records (
            student_id,
            vocab_session_id,
            word_id,
            word_text,
            set_index,
            stage_results,
            total_score,
            max_score,
            error_rate,
            tier,
            completed
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)
          RETURNING *
        `,
        [
          record.student_id,
          record.vocab_session_id ?? null,
          record.word_id,
          record.word_text,
          record.set_index,
          JSON.stringify(record.stage_results ?? []),
          record.total_score ?? 0,
          record.max_score ?? 8,
          record.error_rate ?? 0,
          record.tier ?? "acquired",
          Boolean(record.completed),
        ],
      );

      insertedRows.push(result.rows[0]);
    }

    res.status(201).json(insertedRows);
  } catch (error) {
    next(error);
  }
});

export default router;
