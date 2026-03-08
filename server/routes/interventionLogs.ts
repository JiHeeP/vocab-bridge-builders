import { Router } from "express";
import { pool } from "../db";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const values: unknown[] = [];
    const conditions: string[] = [];

    if (typeof req.query.studentId === "string" && req.query.studentId) {
      values.push(req.query.studentId);
      conditions.push(`l.student_id = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(
      `
        SELECT
          l.*,
          json_build_object('name', s.name) AS student
        FROM intervention_logs l
        JOIN students s ON s.id = l.student_id
        ${whereClause}
        ORDER BY l.created_at DESC
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
    const {
      student_id,
      intervention_type = "tier2_small_group",
      focus_words = [],
      duration_min = 0,
      before_error_rate = null,
      after_error_rate = null,
      memo = null,
    } = req.body ?? {};

    if (!student_id) {
      return res.status(400).send("student_id is required");
    }

    const result = await pool.query(
      `
        INSERT INTO intervention_logs (
          student_id,
          intervention_type,
          focus_words,
          duration_min,
          before_error_rate,
          after_error_rate,
          memo
        )
        VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
        RETURNING *
      `,
      [
        student_id,
        intervention_type,
        JSON.stringify(focus_words),
        duration_min,
        before_error_rate,
        after_error_rate,
        memo,
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

export default router;
