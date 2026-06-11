import { neon } from '@neondatabase/serverless';

async function test() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.log("No DB connection");
    return;
  }
  const sql = neon(DATABASE_URL);
  try {
    const payload = { treatment: 'Scaling', status: 'completed' };
    const results = await sql.transaction([
      sql`SELECT ${sql(payload)}`
    ]);
    console.log("Dynamic query SUCCESS:", JSON.stringify(results));
  } catch (err) {
    console.error("Dynamic query FAILED:", err.message);
  }
}

test();
