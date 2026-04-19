"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const auth_1 = require("./routes/auth");
const tdr_1 = require("./routes/tdr");
const zbm_1 = require("./routes/zbm");
const hsd_1 = require("./routes/hsd");
const admin_1 = require("./routes/admin");
const ase_1 = require("./routes/ase");
const errorHandler_1 = require("./middleware/errorHandler");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Trust Railway / Cloudflare proxy so rate-limiter sees real client IP
app.set('trust proxy', 1);
// ─── Security & Parsing ──────────────────────────────────────────────────────
app.use((0, helmet_1.default)());
app.use((0, compression_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN === '*' ? '*' : (process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173', 'http://localhost:4173', 'http://20.97.114.220:8081', 'https://zamtelsd-max.github.io']),
    credentials: true,
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, morgan_1.default)(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
// ─── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/v1/auth', auth_1.authRouter);
app.use('/api/v1/tdr', tdr_1.tdrRouter);
app.use('/api/v1/zbm', zbm_1.zbmRouter);
app.use('/api/v1/hsd', hsd_1.hsdRouter);
app.use('/api/v1/hsd/map', hsd_1.mapRouter);
app.use('/api/v1/admin', admin_1.adminRouter);
app.use('/api/v1/ase', ase_1.aseRouter);
// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
// ─── Error handler ───────────────────────────────────────────────────────────
app.use(errorHandler_1.errorHandler);
app.listen(PORT, () => {
    console.log(`🚀 Zamtel TDR Monitor API running on port ${PORT}`);
});
exports.default = app;
//# sourceMappingURL=index.js.map