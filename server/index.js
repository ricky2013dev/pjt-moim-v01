import express from 'express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { seedInitialData, validateApplicationSchema } from './db.js';
import { initPush } from './push.js';
import authRoutes from './routes/auth.js';
import memberRoutes from './routes/members.js';
import announcementRoutes from './routes/announcements.js';
import messageRoutes from './routes/messages.js';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const api = express.Router();
api.use(authRoutes);
api.use(announcementRoutes);
api.use(messageRoutes);
api.use(memberRoutes);
api.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use('/api', api);

// Serve the built PWA in production.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (existsSync(dist)) {
  app.use(express.static(dist, {
    setHeaders: (res, file) => {
      if (/(sw|firebase-messaging-sw)\.js$|index\.html$|manifest\.webmanifest$/.test(file)) res.set('Cache-Control', 'no-cache');
    },
  }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong.' : err.message });
});

await validateApplicationSchema();
await seedInitialData();
await initPush();
const port = Number(process.env.PORT) || 3001;
app.listen(port, '0.0.0.0', () => console.log(`API listening on http://localhost:${port}`));
