#!/usr/bin/env node
import { getSql } from '@/db/pool';

async function main() {
  const sql = getSql();
  if (!sql) { console.log('No DB connection'); process.exit(1); }

  // Duplicates by name
  const dupes = await sql`
    SELECT name, COUNT(*)::int as cnt, array_agg(id)::text[] as ids, array_agg(phone)::text[] as phones
    FROM patients
    GROUP BY name
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 30
  `;
  console.log('\n=== DUPLICATE NAMES ===');
  console.log(`Total groups: ${dupes.length}`);
  for (const d of dupes) {
    console.log(`\n"${d.name}" — ${d.cnt} records`);
    console.log(`  IDs:   ${d.ids.join(', ')}`);
    console.log(`  Phones: ${d.phones.join(', ')}`);
  }

  // Duplicates by phone
  const phoneDupes = await sql`
    SELECT phone, COUNT(*)::int as cnt, array_agg(id)::text[] as ids, array_agg(name)::text[] as names
    FROM patients
    WHERE phone IS NOT NULL AND phone != ''
    GROUP BY phone
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 30
  `;
  console.log('\n=== DUPLICATE PHONES ===');
  console.log(`Total groups: ${phoneDupes.length}`);
  for (const d of phoneDupes) {
    console.log(`\nPhone "${d.phone}" — ${d.cnt} records`);
    console.log(`  IDs:   ${d.ids.join(', ')}`);
    console.log(`  Names: ${d.names.join(', ')}`);
  }

  // No phone
  const noPhone = await sql`SELECT COUNT(*)::int as cnt FROM patients WHERE phone IS NULL OR phone = ''`;
  console.log(`\n=== PATIENTS WITH NO PHONE: ${noPhone[0]?.cnt || 0} ===`);

  // Total
  const total = await sql`SELECT COUNT(*)::int as cnt FROM patients`;
  console.log(`\n=== TOTAL PATIENTS: ${total[0]?.cnt || 0} ===`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
