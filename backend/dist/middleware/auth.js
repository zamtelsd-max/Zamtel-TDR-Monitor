"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.signToken = signToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'changeme-secret-dev-only';
function requireAuth(...roles) {
    return (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Missing or invalid authorization header' });
            return;
        }
        const token = authHeader.slice(7);
        try {
            const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            if (roles.length > 0 && !roles.includes(payload.role)) {
                res.status(403).json({ error: 'Insufficient permissions' });
                return;
            }
            req.user = payload;
            next();
        }
        catch {
            res.status(401).json({ error: 'Invalid or expired token' });
        }
    };
}
function signToken(payload) {
    return jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}
//# sourceMappingURL=auth.js.map