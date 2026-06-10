import { getSql } from './src/db/pool.js';

async function test() {
  const sql = getSql();
  if (!sql) {
    console.log("No DB connection");
    return;
  }
  try {
    const results = await sql.transaction([
      sql`SELECT 1 as num`,
      sql`SELECT 2 as num`
    ]);
    console.log("Transaction SUCCESS:", JSON.stringify(results));
  } catch (err) {
    console.error("Transaction FAILED:", err.message);
  }
}

test();
