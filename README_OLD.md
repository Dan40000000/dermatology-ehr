# Dermatology EMA Rebuild – Starter

Foundational scaffold for the dermatology EHR/PM rebuild. Includes:
- Backend: Node/Express/TypeScript, JWT auth scaffold, tenant-aware header guard, seeded demo users (in-memory for now).
- Frontend: React/Vite/TypeScript demo login hitting auth endpoints.
- Env samples and roadmap anchor (`../DERM_REBUILD_ROADMAP.md`).

## Getting Started

### Backend
```bash
cd backend
cp .env.example .env
npm install
# ensure Postgres is running (see docker compose in repo root)
npm run db:migrate
npm run db:seed
npm run dev
```
- Default port: `4000`
- Tenant header: `x-tenant-id`
- Seed users (password `Password123!`, tenant `tenant-demo`):
  - admin@demo.practice
  - provider@demo.practice
  - ma@demo.practice
  - frontdesk@demo.practice
- Seed data also includes a sample patient, provider, location, appointment type, and one appointment.
- Endpoints: `/api/auth/login`, `/api/auth/me`, `/api/auth/refresh`, `/api/patients`, `/api/appointments`, `/api/providers`, `/api/locations`, `/api/appointment-types`, `/api/availability`, `/api/audit/appointments`, `/health`

### Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```
- Default API base: `http://localhost:4000`
- Use the tenant header value `tenant-demo` and the seeded users to sign in.
- UI demo buttons load patients and appointments and hit the protected `/me`.

## Next Steps (Phase 1 targets)
- Extend scheduling/patient slice further (provider availability UI, appointment status updates, patient intake form).
- Add device-aware refresh token rotation and revoke flows.
- Add more audit coverage (reads/writes) and observability hooks.
- Wire Docker compose for app + Postgres; CI smoke tests.
