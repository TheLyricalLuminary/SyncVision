import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma";
import { type PlanLevel } from "../lib/planLevel";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = "30d";

const VALID_PLANS: PlanLevel[] = ["COMPOSER", "SUPERVISOR", "AGENCY", "ENTERPRISE"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// Body: { email, password, planLevel? }
// ─────────────────────────────────────────────────────────────────────────────

router.post("/auth/register", async (req: Request, res: Response) => {
  const { email, password, planLevel = "COMPOSER" } = req.body ?? {};

  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    res.status(400).json({ error: "Valid email required" });
    return;
  }
  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }
  if (!VALID_PLANS.includes(planLevel)) {
    res.status(400).json({ error: `planLevel must be one of: ${VALID_PLANS.join(", ")}` });
    return;
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, planLevel },
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email, planLevel: user.planLevel },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(201).json({ token, planLevel: user.planLevel, email: user.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// Body: { email, password }
// ─────────────────────────────────────────────────────────────────────────────

router.post("/auth/login", async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "email and password required" });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      // Same response for not-found and wrong password — don't reveal which
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, planLevel: user.planLevel },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({ token, planLevel: user.planLevel, email: user.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me — verify token and return current plan
// ─────────────────────────────────────────────────────────────────────────────

router.get("/auth/me", async (req: Request, res: Response) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token" });
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as {
      userId: string; email: string; planLevel: string;
    };
    res.json({ userId: payload.userId, email: payload.email, planLevel: payload.planLevel });
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

export default router;
