/**
 * One-time backfill: create patient records from existing appointments
 * that don't have patient_id set.
 *
 * Usage: node scripts/backfill-patients.mjs
 */
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function backfill() {
  console.log('=== Backfilling patients table from appointments ===\n');

  // Step 1: Find all distinct wa_ids from appointments that lack patient_id
  const unlinked = await sql`
    SELECT DISTINCT ON (a.wa_id)
      a.wa_id,
      a.patient_name,
      a.patient_phone,
      a.date
    FROM appointments a
    WHERE a.patient_id IS NULL
      AND a.wa_id IS NOT NULL
      AND a.wa_id != ''
    ORDER BY a.wa_id, a.date DESC
  `;

  console.log(`Found ${unlinked.length} distinct wa_ids to backfill.\n`);

  let created = 0;
  let skipped = 0;
  let linked = 0;

  for (const row of unlinked) {
    const waId = row.wa_id;
    const name = row.patient_name || 'Patient';
    const phone = row.patient_phone || waId;

    // Check if a patient already exists with this waId
    const existing = await sql`
      SELECT id FROM patients WHERE wa_id = ${waId} LIMIT 1
    `;

    let patientId;

    if (existing.length > 0) {
      patientId = existing[0].id;
      skipped++;
      console.log(`  [SKIP] Patient already exists for waId=${waId} (name=${name})`);
    } else {
      // Check by phone too
      const existingByPhone = await sql`
        SELECT id FROM patients WHERE phone = ${phone} LIMIT 1
      `;
      if (existingByPhone.length > 0) {
        patientId = existingByPhone[0].id;
        skipped++;
        console.log(`  [SKIP] Patient exists by phone for waId=${waId} (name=${name})`);
      } else {
        // Create patient
        const result = await sql`
          INSERT INTO patients (name, phone, wa_id)
          VALUES (${name}, ${phone}, ${waId})
          ON CONFLICT (phone) DO UPDATE
            SET wa_id = COALESCE(NULLIF(EXCLUDED.wa_id, ''), patients.wa_id),
                updated_at = NOW()
          RETURNING id
        `;
        patientId = result[0].id;
        created++;
        console.log(`  [CREATE] Patient id=${patientId} for waId=${waId} (name=${name})`);
      }
    }

    // Link all appointments with this waId
    const updateResult = await sql`
      UPDATE appointments
      SET patient_id = ${patientId},
          patient_phone = ${phone}
      WHERE wa_id = ${waId}
        AND patient_id IS NULL
      RETURNING id
    `;

    linked += updateResult.length;
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Patients created: ${created}`);
  console.log(`  Patients skipped (already exist): ${skipped}`);
  console.log(`  Appointments linked: ${linked}`);
  console.log(`  Total wa_ids processed: ${unlinked.length}`);
}

backfill()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
