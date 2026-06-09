# Backup & Recovery

## Current State

Database: Neon serverless PostgreSQL (managed — automated backups enabled by default).

**What is NOT yet in place:**
- [ ] Restore procedure tested end-to-end
- [ ] Documented recovery time estimate
- [ ] Backup verification (can we actually restore from a given snapshot?)
- [ ] Point-in-time recovery procedure for the team
- [ ] Off-site export of patient data

## Recovery Scenarios

| Scenario | Risk | Mitigation |
|----------|------|------------|
| Accidental patient deletion | Low (DELETE on patients has FK protection via appointments) | — |
| Accidental appointment deletion | Low | Neon point-in-time recovery |
| Accidental payment deletion | Low (payments insert-only, no DELETE in code) | — |
| Data corruption | Low (small dataset, simple schema) | Restore from backup |
| Region outage | Medium | Neon multi-region replicas (paid tier) |

## Until Restore Is Verified

- [ ] Schedule one restore test before onboarding first clinic
- [ ] Document the exact steps in this file
- [ ] Measure and log recovery time
