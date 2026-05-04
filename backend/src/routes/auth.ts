import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma }      from '../prisma';
import { signToken, requireAuth }   from '../middleware/auth';
import { loginRateLimit } from '../middleware/rateLimit';

export const authRouter = Router();

const loginSchema = z.object({
  id:  z.string().min(1),
  pin: z.string().length(4).regex(/^\d{4}$/),
});

const changePinSchema = z.object({
  currentPin: z.string().length(4).regex(/^\d{4}$/),
  newPin:     z.string().length(4).regex(/^\d{4}$/),
});

authRouter.post('/login', loginRateLimit, async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request. Provide id and 4-digit PIN.' });
    return;
  }

  const { id, pin } = parsed.data;

  // Raw query to include mustChangePin without requiring Prisma regen on Railway
  const rows = await prisma.$queryRaw<any[]>`
    SELECT id, name, pin, role, zone, active, "mustChangePin"
    FROM users WHERE id = ${id} LIMIT 1
  `;
  const user = rows[0];
  if (!user || !user.active) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(pin, user.pin);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = signToken({
    userId: user.id,
    role:   user.role as 'TDR' | 'ZBM' | 'HSD',
    zone:   user.zone,
    name:   user.name,
  });

  res.json({
    token,
    mustChangePin: !!user.mustChangePin,
    user: {
      id:   user.id,
      name: user.name,
      role: user.role,
      zone: user.zone,
    },
  });
});

// POST /auth/change-pin  (requires valid JWT)
authRouter.post('/change-pin', requireAuth('TDR', 'ZBM', 'HSD', 'ASE'), async (req: Request, res: Response): Promise<void> => {
  const parsed = changePinSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Provide currentPin and newPin (4 digits each).' });
    return;
  }

  const { currentPin, newPin } = parsed.data;
  const userId = (req as any).user?.userId;

  const rows2 = await prisma.$queryRaw<any[]>`SELECT id, pin, active FROM users WHERE id = ${userId} LIMIT 1`;
  const user = rows2[0];
  if (!user || !user.active) {
    res.status(401).json({ error: 'User not found.' });
    return;
  }

  const valid = await bcrypt.compare(currentPin, user.pin);
  if (!valid) {
    res.status(401).json({ error: 'Current PIN is incorrect.' });
    return;
  }

  if (currentPin === newPin) {
    res.status(400).json({ error: 'New PIN must be different from your current PIN.' });
    return;
  }

  const hashed = await bcrypt.hash(newPin, 10);
  await prisma.$executeRaw`
    UPDATE users SET pin = ${hashed}, "mustChangePin" = false, "updatedAt" = NOW()
    WHERE id = ${userId}
  `;

  res.json({ success: true, message: 'PIN changed successfully.' });
});
