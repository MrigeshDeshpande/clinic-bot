# Future

## Production Safety

- [ ] DB-enforced invariants on payments table (partial unique indexes, CHECK constraints beyond what exists)
- [ ] Append-only audit log for all entity mutations
- [ ] Restore procedure tested from backup (see backup.md)
- [ ] Operational questions answered:
  - Can receptionist create duplicate patients?
  - Can they accidentally delete a patient?
  - Can they accidentally modify historical clinical notes?
  - Can they export all patient data?

## Engineering

- [ ] Clock abstraction (`clock.now()` instead of `new Date()` — makes testing time logic trivial)
- [ ] Server-side idempotency key generation (derive from request body, not client input)
- [ ] Structured correlation IDs on every request (request_id, flow_id, entity_id chain)
- [ ] Health endpoint (DB, migration version, cron status)
- [ ] ADR structure for when decisions need formal capture

## Non-goals (don't build)

- No distributed transactions
- No event sourcing / event bus / Kafka / RabbitMQ
- No microservices
- No CQRS
- No eventual consistency for financial writes
- PostgreSQL is the source of truth
- Payments are append-only
- Appointment completion is atomic
