# Moim — Family PWA

React + Tailwind installable web app for the family: contacts, announcements, private 1:1 messages, and push notifications.

## Local development

```bash
cp .env.example .env        # then set JWT_SECRET (and Firebase keys if you want push)
npm install
npm run db:up               # Postgres 16 in Docker on port 5433
npm run dev                 # API on :3001, web on http://localhost:5180
```

On first start the server creates the tables and an admin named `ADMIN_NAME` with passcode `ADMIN_PASSCODE`.
New members sign in with `DEFAULT_PASSCODE` until the admin changes it under **Admin → Passcodes**.

Production-style run: `npm run build && npm start` → everything served from http://localhost:3001.

## How it works

| Area | Details |
|---|---|
| Sign in | Pick your name, enter your 4-digit passcode. 5 wrong tries locks that member for 5 minutes. |
| Staying signed in | A 1-year httpOnly cookie. It carries a passcode version, so changing a passcode signs out every other device. |
| Admin | Add/edit/delete members (name, relationship, phone, email, photo, admin flag), set or reset any passcode, set the family default passcode (optionally resetting all members), create/edit/delete announcements for everyone or selected people. |
| Members | Edit own name/phone/email, upload photo, change passcode, turn on notifications. |
| Messages | Private one-to-one threads with read receipts; refreshes every few seconds. |
| Push | Firebase Cloud Messaging on new/updated announcements and new messages. |
| Photos | Resized in the browser, re-encoded to 512px JPEG on the server, stored in Postgres (no file storage needed). |

## Push notifications (Firebase)

1. Create a Firebase project and add a **Web app**. Copy its config into the `FIREBASE_*` vars.
2. Cloud Messaging → **Web Push certificates** → generate a key pair → `FIREBASE_VAPID_KEY`.
3. Service accounts → **Generate new private key** → put the JSON (one line, or base64) in `FIREBASE_SERVICE_ACCOUNT`.
4. Restart. Members turn notifications on from the News card or **Me → Notifications**.

Push needs HTTPS (localhost is fine). On iPhone, notifications only work after **Share → Add to Home Screen** (iOS 16.4+).

## Deploying (e.g. Replit)

- Add a PostgreSQL database; set `DATABASE_URL` (and `DATABASE_SSL=true` if the host requires TLS).
- Set the other variables from `.env.example` as Secrets — in particular a strong `JWT_SECRET` and `NODE_ENV=production`.
- Build: `npm install && npm run build` · Run: `npm start` (uses `PORT`).

`.env` is git-ignored; only `.env.example` is committed.
