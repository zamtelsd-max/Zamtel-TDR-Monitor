"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
exports.authRouter = (0, express_1.Router)();
const loginSchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    pin: zod_1.z.string().length(4).regex(/^\d{4}$/),
});
const changePinSchema = zod_1.z.object({
    currentPin: zod_1.z.string().length(4).regex(/^\d{4}$/),
    newPin: zod_1.z.string().length(4).regex(/^\d{4}$/),
});
exports.authRouter.post('/login', rateLimit_1.loginRateLimit, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Invalid request. Provide id and 4-digit PIN.' });
        return;
    }
    const { id, pin } = parsed.data;
    const user = await prisma_1.prisma.user.findUnique({ where: { id } });
    if (!user || !user.active) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
    }
    const valid = await bcryptjs_1.default.compare(pin, user.pin);
    if (!valid) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
    }
    const token = (0, auth_1.signToken)({
        userId: user.id,
        role: user.role,
        zone: user.zone,
        name: user.name,
    });
    res.json({
        token,
        mustChangePin: !!user.mustChangePin,
        user: {
            id: user.id,
            name: user.name,
            role: user.role,
            zone: user.zone,
        },
    });
});
// POST /auth/change-pin  (requires valid JWT)
exports.authRouter.post('/change-pin', (0, auth_1.requireAuth)('TDR', 'ZBM', 'HSD', 'ASE'), async (req, res) => {
    const parsed = changePinSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Provide currentPin and newPin (4 digits each).' });
        return;
    }
    const { currentPin, newPin } = parsed.data;
    const userId = req.user?.userId;
    const user = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) {
        res.status(401).json({ error: 'User not found.' });
        return;
    }
    const valid = await bcryptjs_1.default.compare(currentPin, user.pin);
    if (!valid) {
        res.status(401).json({ error: 'Current PIN is incorrect.' });
        return;
    }
    if (currentPin === newPin) {
        res.status(400).json({ error: 'New PIN must be different from your current PIN.' });
        return;
    }
    const hashed = await bcryptjs_1.default.hash(newPin, 10);
    await prisma_1.prisma.user.update({
        where: { id: userId },
        data: { pin: hashed, mustChangePin: false },
    });
    res.json({ success: true, message: 'PIN changed successfully.' });
});
//# sourceMappingURL=auth.js.map