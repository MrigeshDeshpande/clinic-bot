const REQUIRED_VARS = [
  'DASHBOARD_PASSWORD',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_VERIFY_TOKEN',
  'DATABASE_URL',
  'CRON_SECRET',
];

const WARN_VARS = [
  'R2_ENDPOINT',
  'R2_ACCESS_KEY',
  'R2_SECRET_KEY',
  'R2_BUCKET',
  'OPENAI_API_KEY',
];

export function validateEnv() {
  const missing = [];
  for (const v of REQUIRED_VARS) {
    if (!process.env[v]) {
      missing.push(v);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  const unsetWarn = WARN_VARS.filter(v => !process.env[v]);
  if (unsetWarn.length > 0) {
    console.warn(
      `Optional environment variables not set: ${unsetWarn.join(', ')}`
    );
  }
}
