import "dotenv/config";
import { Pool } from "pg";
import { loadConfig } from "./config";

async function run() {
  const config = loadConfig();
  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl:
      process.env.PGSSLMODE === "require" || process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  });

  try {
    const result = await pool.query("SELECT NOW() AS now");
    console.log("✅ doctor: database connection OK", result.rows[0]?.now ?? "");
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error("❌ doctor failed");
  console.error(error.message || error);
  process.exit(1);
});
