# Role Matrix (Phase 1)

Current endpoints and access for seeded roles (`tenant-demo`):

| Endpoint | Method | Roles |
| --- | --- | --- |
| `/health` | GET | public |
| `/api/auth/login` | POST | public (requires tenant header) |
| `/api/auth/refresh` | POST | public (refresh token) |
| `/api/auth/me` | GET | authenticated (any role) |
| `/api/patients` | GET | authenticated (any role) |
| `/api/patients` | POST | admin, provider, ma, front_desk |
| `/api/appointments` | GET | authenticated (any role) |
| `/api/appointments` | POST | admin, provider, ma, front_desk |
| `/api/appointments/:id/status` | POST | admin, provider, ma, front_desk |
| `/api/providers` | GET | authenticated (any role) |
| `/api/locations` | GET | authenticated (any role) |
| `/api/appointment-types` | GET | authenticated (any role) |
| `/api/availability` | GET | authenticated (any role) |
| `/api/encounters` | GET | authenticated (any role) |
| `/api/encounters` | POST | admin, provider, ma |
| `/api/encounters/:id/status` | POST | admin, provider |
| `/api/documents` | GET/POST | authenticated (any role) |
| `/api/photos` | GET/POST | authenticated (any role) |
| `/api/charges` | GET | authenticated (any role) |
| `/api/charges` | POST | admin, provider |
| `/api/tasks` | GET/POST | authenticated (any role) |
| `/api/messages` | GET/POST | authenticated (any role) |
| `/api/audit/appointments` | GET | admin |

Roles seeded:
- admin
- provider
- ma
- front_desk

Tenant header: `x-tenant-id` (must match user’s tenant). Refresh tokens are stored in DB and revoked on rotation.
