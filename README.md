# Vocab Bridge Builders

React + Vite frontend with an Express server and Railway PostgreSQL backend.

## Local setup

1. Install dependencies.
```sh
npm install
```

2. Fill in `.env`.
```env
DATABASE_URL=postgresql://...
UNSPLASH_ACCESS_KEY=...
```

3. Run the API server.
```sh
npm run start
```

4. Run the frontend dev server in another terminal.
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
