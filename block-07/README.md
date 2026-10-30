# Block 07

Block 07 combines the Block 7 search API from TV1 with the frontend committed by TV2. The API uses the Supabase/PostgreSQL database configured in its local `.env`; credentials must stay local and must not be committed.

## Run locally

Use two PowerShell terminals from the repository root.

### Backend

```powershell
cd .\block-07\api
npm ci
Copy-Item .env.example .env # only if .env does not already exist
# Set DATABASE_URL and DIRECT_URL in .env. Keep SUPABASE_SERVICE_ROLE_KEY server-side.
npm run db:generate
npm run build
npm run dev
```

The API listens at `http://localhost:3000/api`. If the development database does not yet have the Block 7 migrations, review the migration files and run `npm run db:migrate`; that command changes the database. Seed only when the database needs the sample records.

### Frontend

```powershell
cd .\block-07\web
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:5173`. The frontend defaults to `http://localhost:3000/api`; to change it, copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL`.

## Integration notes

- `GET /api/dishes` returns `{ items, total, page, pageSize }`; the current frontend reads this paginated contract.
- Dish search, filtering, sorting, and pagination run in the API against PostgreSQL. The `fuzzy` mode needs the `pg_trgm` migration.
- The API does not implement `/api/uploads/dishes` or accept `imagePath` writes. The admin page's file upload and saved external image URL flows therefore need backend/storage work before those actions can be used.
- The current API test file was inherited from Block 6 and does not yet cover the paginated SQL search contract. Do not treat `npm test` as Block 7 integration verification until those tests are updated.

See [API documentation](./api/README.md) for endpoint and database details.
