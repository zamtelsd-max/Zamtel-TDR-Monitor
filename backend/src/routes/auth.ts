import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma }      from '../prisma';
import { signToken }   from '../middleware/auth';
import { loginRateLimit } from '../middleware/rateLimit';

export const authRouter = Router();

const loginSchema = z.object({
  id:  z.string().min(1),
  pin: z.string().length(4).regex(/^\d{4}$/),
});

authRouter.post('/login', loginRateLimit, async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request. Provide id and 4-digit PIN.' });
    return;
  }

  const { id, pin } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id } });
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
    user: {
      id:   user.id,
      name: user.name,
      role: user.role,
      zone: user.zone,
    },
  });
});
