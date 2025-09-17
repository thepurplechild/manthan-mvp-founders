# Compliance & Security Notes

## GDPR & Privacy
- Collect minimal PII. Provide account deletion and data export on request.
- Store consent for email communications. Avoid dark patterns.

## India Data Localization
- Supabase data centers should be selected close to users (e.g., Singapore).
- If handling sensitive personal data, review India PDP Bill guidance.

## Encryption
- In transit: TLS enforced by Vercel/Supabase.
- At rest: Supabase Postgres encryption at rest; consider column-level encryption for sensitive fields.
- Keys: do not store secrets client-side; use server-side envs and service role only on the server.

## Rate Limiting & Abuse
- AI/pipeline endpoints are rate-limited (basic memory bucket). For production, use Redis‑based limits.
- Add CAPTCHA or email verification gating if abuse observed.

## Monitoring & Telemetry
- Add vendor DSN (e.g., Sentry) via env to enable error tracking.
- Log pipeline success/failure ratio for operational dashboards.

