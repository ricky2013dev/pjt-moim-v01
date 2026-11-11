# Running Moim on Replit

- Keep the imported React/Vite + Express + PostgreSQL structure.
- Use Node.js 24; the installed Firebase packages require Node >=24.12.
- Install dependencies with `npm install`.
- After task merges, `scripts/post-merge.sh` restores locked dependencies with
  `npm ci` and builds the PWA. Replit then reconciles the running workflows.
- The development workflow runs `npm run dev`: Vite serves the preview on
  `0.0.0.0:5000` and proxies `/api` to Express on port 3001.
- Use the provided `DATABASE_URL`. Docker is not needed on Replit.
- Authentication uses `JWT_SECRET` when provided, otherwise the existing
  `SESSION_SECRET`. Never commit secret values.
- Before the first start, set `ADMIN_PASSCODE` and `DEFAULT_PASSCODE` in Secrets
  to chosen four-digit values. The first admin is named `Admin` unless
  `ADMIN_NAME` is configured. These passcodes seed the database only once;
  later changes should be made through the app's admin settings.
- Firebase configuration is optional. Push notifications remain disabled until
  the Firebase variables described in README.md are configured.
- `npm run build` builds the PWA; `npm start` serves the API and built frontend
  together, using `PORT` (default 3001). Production needs
  `NODE_ENV=production` for secure cookies.
- Before the first development start, run `npm run db:setup` to initialize
  the database tables. Startup validates the schema and seeds initial settings
  and the admin only; it does not change the schema.
- Set `MESSAGE_ENCRYPTION_KEY` in Secrets to a securely generated 32-byte key
  (64 hexadecimal characters). Back it up securely: losing or changing the key
  makes existing encrypted messages unreadable.
- Verify changes with `npm test` and `npm run build`.
