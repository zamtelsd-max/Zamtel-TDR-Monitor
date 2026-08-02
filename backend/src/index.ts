import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import { authRouter }   from './routes/auth';
import { tdrRouter }    from './routes/tdr';
import { zbmRouter }    from './routes/zbm';
import { hsdRouter, mapRouter } from './routes/hsd';
import { adminRouter }  from './routes/admin';
import { aseRouter }    from './routes/ase';
import { flagsRouter }  from './routes/flags';
import { dmRouter }     from './routes/dm';
import { ssoOdrRouter } from './routes/ssoOdr';
import { aseTrackerRouter } from './routes/aseTracker';
import { errorHandler } from './middleware/errorHandler';

const app  = express();
const PORT = process.env.PORT || 3000;

// Trust Railway / Cloudflare proxy so rate-limiter sees real client IP
app.set('trust proxy', 1);

// ─── Security & Parsing ──────────────────────────────────────────────────────
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN === '*' ? '*' : (process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173', 'http://localhost:4173', 'http://20.97.114.220:8081', 'https://zamtelsd-max.github.io']),
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/v1/auth',  authRouter);
app.use('/api/v1/tdr',   tdrRouter);
app.use('/api/v1/zbm',   zbmRouter);
app.use('/api/v1/hsd',   hsdRouter);
app.use('/api/v1/hsd/map', mapRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/ase',   aseRouter);
app.use('/api/v1/flags', flagsRouter);
app.use('/api/v1/dm',      dmRouter);
app.use('/api/v1/sso-odr', ssoOdrRouter);
app.use('/api/v1/ase-tracker', aseTrackerRouter);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ─── Error handler ───────────────────────────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Zamtel TDR Monitor API running on port ${PORT}`);
});

// Prevent crash loops from uncaught errors — log and keep running
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] — NOT exiting:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection] — NOT exiting:', reason);
});

export default app;
