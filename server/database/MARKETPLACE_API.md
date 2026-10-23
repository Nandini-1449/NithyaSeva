# NithyaSeva Marketplace API

All routes are served by the Express API (local development: `http://localhost:5000`).

## Authentication

Register and log in using the existing endpoints:

- `POST /api/auth/register`
- `POST /api/auth/login`

Authenticated routes require `Authorization: Bearer <token>`. Tokens are issued by the existing login/register flow and expire after two hours. Only active accounts can use authenticated endpoints.

## Worker profiles

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/workers` | Public | Browse active workers |
| GET | `/api/workers/:id` | Public | View a worker's public profile |
| GET | `/api/workers/me` | Worker | View your profile |
| PUT | `/api/workers/me` | Worker | Update your profile |

Browse query parameters: `search`, `area`, `skill`, `limit` (max 50), and `offset`.

Profile update JSON fields (all optional): `bio`, `skills` (array of strings), `experienceYears` (integer 0–60), `serviceArea`, `hourlyRate` (number or null), and `availabilityStatus` (`available`, `busy`, or `unavailable`).

## Jobs and applications

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/jobs` | Public | Browse jobs |
| GET | `/api/jobs/:id` | Public | View job details |
| POST | `/api/jobs` | Customer | Post a job |
| GET | `/api/jobs/mine` | Customer | List your own jobs |
| POST | `/api/jobs/:id/applications` | Worker | Apply to an open job |
| GET | `/api/jobs/:id/applications` | Job owner/admin | View applications |
| POST | `/api/jobs/:id/applications/:applicationId/accept` | Customer/job owner | Accept one application |
| PATCH | `/api/jobs/:id/status` | Customer or assigned worker | Progress/cancel the job subject to state rules |

### Post a job

```json
{
  "title": "Repair a leaking tap",
  "description": "Inspect and repair a leaking kitchen tap.",
  "category": "Plumbing",
  "serviceLocation": "Hyderabad",
  "budget": 800,
  "scheduledFor": "2027-01-15T10:00:00+05:30"
}
```

`budget` and `scheduledFor` are optional; `scheduledFor` must be a future date/time if supplied.

### Apply to a job

```json
{
  "proposedPrice": 750,
  "message": "I have experience with household plumbing repairs."
}
```

Both fields are optional. Workers must have an active account and `available` profile status. Duplicate applications are rejected.

### Accept an application

Use `POST /api/jobs/:id/applications/:applicationId/accept` with an empty JSON body. The customer who owns the job selects a pending application. The operation creates the assignment and agreement, marks the job assigned, rejects other pending applications, updates worker availability, and records notifications/audit activity in a database transaction. A price must be available from the proposed price or job budget.

### Job status lifecycle

- Assigned worker: `PATCH /api/jobs/:id/status` with `{"status":"in_progress"}`.
- Customer confirms completion after the worker starts: `{"status":"completed"}`.
- Customer can cancel an open or assigned job: `{"status":"cancelled"}`.

Job transitions are checked on the server. These endpoints record job/assignment/agreement state; they do not process real money or initiate payment-provider transactions.

## Example: authenticated request

```http
GET /api/workers/me
Authorization: Bearer YOUR_LOGIN_TOKEN
```

## Important implementation notes

- Public worker/job responses omit passwords, email addresses, phone numbers, and private contact details.
- IDs and request values are parameterized in SQL.
- The server validates input and enforces roles on protected routes.
- The existing database migration `002_phase2_marketplace_trust.sql` must be applied before using marketplace endpoints; it creates the applications, agreements, categories, notifications, and audit tables.
- Local development API URLs and production hosting/CORS settings are configured separately; the frontend is not automatically wired to every endpoint by this backend change.
