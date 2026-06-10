import { neon } from '@neondatabase/serverless';

async function test() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.log("No DB connection");
    return;
  }
  const sql = neon(DATABASE_URL);
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
