import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { tierAtLeast, type PlanLevel } from "../lib/planLevel";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET env var is required");
}

export interface AuthPayload {
  userId: string;
  email: string;
  planLevel: string;
}

// Attaches req.auth when a valid Bearer token is present.
// Does NOT reject the request — use requirePlan() for that.
export function attachAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(header.slice(7), JWT_SECRET!) as AuthPayload;
      (req as Request & { auth?: AuthPayload }).auth = payload;
    } catch {
      // Invalid/expired token — leave req.auth unset
    }
  }
  next();
}

// Returns middleware that requires the caller to be authenticated AND at or above
// the given plan tier. Call after attachAuth in the middleware chain.
export function requirePlan(minTier: PlanLevel) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as Request & { auth?: AuthPayload }).auth;
    if (!auth) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!tierAtLeast(auth.planLevel, minTier)) {
      res.status(403).json({
        error: `This feature requires the ${minTier} plan or above. Your plan: ${auth.planLevel}`,
      });
      return;
    }
    next();
  };
}
