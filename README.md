# Vocab Bridge Builders

React + Vite frontend with an Express server and Railway PostgreSQL backend.

## Local setup

1. Install dependencies.
```sh
npm install
```

2. Create `.env` from `.env.example` and fill values.
```sh
cp .env.example .env
```
```env
DATABASE_URL=postgresql://...
UNSPLASH_ACCESS_KEY=...
```

3. Verify env + DB connectivity.
```sh
npm run doctor
```

4. Run the API server.
```sh
npm run start
```

5. Run the frontend dev server in another terminal.
```sh
npm run dev
```

## Production

- Build: `npm run build`
- Start: `npm run start`
- Railway uses `railway.json` in this repo.

## Notes

- `DATABASE_URL` is required.
- `UNSPLASH_ACCESS_KEY` is only required if you want automatic word-image fetching.
- Lovable and Supabase are no longer part of the deployment path.
