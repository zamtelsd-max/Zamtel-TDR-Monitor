import { Request, Response, NextFunction } from 'express';
export interface JwtPayload {
    userId: string;
    role: 'TDR' | 'ZBM' | 'HSD';
    zone: string | null;
    name: string;
}
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}
export declare function requireAuth(...roles: Array<'TDR' | 'ZBM' | 'HSD'>): (req: Request, res: Response, next: NextFunction) => void;
export declare function signToken(payload: JwtPayload): string;
//# sourceMappingURL=auth.d.ts.map