import { Router } from "express";
import { pool } from "../db";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT id, name, is_multicultural, grade_class, created_at FROM students ORDER BY name ASC",
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { name, is_multicultural = false, grade_class = "3-2" } = req.body ?? {};

    if (!name?.trim()) {
      return res.status(400).send("name is required");
    }

    const result = await pool.query(
      `
        INSERT INTO students (name, is_multicultural, grade_class)
        VALUES ($1, $2, $3)
        RETURNING id, name, is_multicultural, grade_class, created_at
      `,
      [name.trim(), Boolean(is_multicultural), grade_class?.trim() || "3-2"],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, is_multicultural = false, grade_class = "3-2" } = req.body ?? {};

    if (!name?.trim()) {
      return res.status(400).send("name is required");
    }

    const result = await pool.query(
      `
        UPDATE students
        SET name = $2, is_multicultural = $3, grade_class = $4
        WHERE id = $1
        RETURNING id, name, is_multicultural, grade_class, created_at
      `,
      [id, name.trim(), Boolean(is_multicultural), grade_class?.trim() || "3-2"],
    );

    if (!result.rows[0]) {
      return res.status(404).send("student not found");
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const result = await pool.query("DELETE FROM students WHERE id = $1 RETURNING id", [req.params.id]);

    if (!result.rows[0]) {
      return res.status(404).send("student not found");
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post("/get-or-create", async (req, res, next) => {
  try {
    const name = req.body?.name?.trim();

    if (!name) {
      return res.status(400).send("name is required");
    }

    const existing = await pool.query(
      "SELECT id, name, is_multicultural, grade_class, created_at FROM students WHERE name = $1 ORDER BY created_at ASC LIMIT 1",
      [name],
    );

    if (existing.rows[0]) {
      return res.json(existing.rows[0]);
    }

    const inserted = await pool.query(
      `
        INSERT INTO students (name)
        VALUES ($1)
        RETURNING id, name, is_multicultural, grade_class, created_at
      `,
      [name],
    );

    res.status(201).json(inserted.rows[0]);
  } catch (error) {
    next(error);
  }
});

export default router;
