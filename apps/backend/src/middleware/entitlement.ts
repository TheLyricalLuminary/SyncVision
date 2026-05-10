import { Request, Response, NextFunction } from "express";

/**
 * Guard middleware that blocks requests if the user is still on the free COMPOSER tier.
 * Valid paid tiers: SUPERVISOR, AGENCY, ENTERPRISE.
 * Returns HTTP 403 with a structured JSON error.
 */
export function requirePaidEntitlement(req: Request, res: Response, next: NextFunction) {
  const auth = (req as any).auth;

  if (!auth || auth.planLevel === "COMPOSER" || !auth.planLevel) {
    return res.status(403).json({
      error: "forbidden",
      message: "This operation requires an active paid plan. Please upgrade your account.",
    });
  }

  next();
}
