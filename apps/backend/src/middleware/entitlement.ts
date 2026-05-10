import { Request, Response, NextFunction } from "express";

/**
 * Guard middleware that blocks requests if the user does not have a "PAID" planLevel.
 * Returns HTTP 403 with a structured JSON error.
 */
export function requirePaidEntitlement(req: Request, res: Response, next: NextFunction) {
  const auth = (req as any).auth;
  
  if (!auth || auth.planLevel !== "PAID") {
    return res.status(403).json({
      error: "forbidden",
      message: "This operation requires a PAID planLevel. Please upgrade your account."
    });
  }
  
  next();
}
