import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { requirePlan } from "../middleware/auth";
import { requireCatalogAccess } from "../middleware/catalog";
import { type AuthPayload } from "../middleware/auth";
import { catalogRoleAtLeast } from "../lib/catalogRole";

const router = Router();

type AuthReq = Request & { auth?: AuthPayload };

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/catalogs
// Create a new catalog. Requires AGENCY plan or above.
// Body: { name: string }
// ─────────────────────────────────────────────────────────────────────────────

router.post("/catalogs", requirePlan("AGENCY"), async (req: AuthReq, res: Response) => {
  const { name } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const catalog = await prisma.catalog.create({
    data: {
      name: name.trim(),
      ownerId: req.auth!.userId,
      members: {
        create: { userId: req.auth!.userId, role: "CATALOG_OWNER" },
      },
    },
  }).catch((e) => { console.error(e); return null; });

  if (!catalog) {
    res.status(500).json({ error: "Internal server error" });
    return;
  }

  res.status(201).json(catalog);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/catalogs
// List all catalogs the authenticated user is a member of.
// ─────────────────────────────────────────────────────────────────────────────

router.get("/catalogs", requirePlan("COMPOSER"), async (req: AuthReq, res: Response) => {
  const memberships = await prisma.catalogMember.findMany({
    where: { userId: req.auth!.userId },
    include: {
      catalog: {
        include: {
          _count: { select: { tracks: true, members: true } },
        },
      },
    },
    orderBy: { catalog: { createdAt: "asc" } },
  });

  const catalogs = memberships.map((m) => ({
    ...m.catalog,
    myRole: m.role,
    trackCount: m.catalog._count.tracks,
    memberCount: m.catalog._count.members,
    _count: undefined,
  }));

  res.json({ catalogs });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/catalogs/:catalogId
// Get catalog details + member list.
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/catalogs/:catalogId",
  requirePlan("COMPOSER"),
  requireCatalogAccess("SUPERVISOR"),
  async (req: Request, res: Response) => {
    const catalogId = req.params.catalogId as string;

    const catalog = await prisma.catalog.findUnique({
      where: { id: catalogId },
      include: {
        members: {
          include: { user: { select: { id: true, email: true, planLevel: true } } },
          orderBy: { role: "asc" },
        },
        _count: { select: { tracks: true } },
      },
    });

    if (!catalog) {
      res.status(404).json({ error: "Catalog not found" });
      return;
    }

    res.json({
      id: catalog.id,
      name: catalog.name,
      ownerId: catalog.ownerId,
      createdAt: catalog.createdAt,
      trackCount: catalog._count.tracks,
      members: catalog.members.map((m) => ({
        userId: m.userId,
        email: m.user.email,
        planLevel: m.user.planLevel,
        role: m.role,
      })),
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/catalogs/:catalogId
// Rename the catalog. Requires CATALOG_OWNER.
// Body: { name: string }
// ─────────────────────────────────────────────────────────────────────────────

router.put(
  "/catalogs/:catalogId",
  requirePlan("AGENCY"),
  requireCatalogAccess("CATALOG_OWNER"),
  async (req: Request, res: Response) => {
    const catalogId = req.params.catalogId as string;
    const { name } = req.body ?? {};

    if (typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const updated = await prisma.catalog.update({
      where: { id: catalogId },
      data: { name: name.trim() },
    });

    res.json(updated);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/catalogs/:catalogId/members
// Add a member to the catalog. Requires CATALOG_OWNER or ADMIN.
// Body: { email: string; role: "CATALOG_OWNER" | "ADMIN" | "SUPERVISOR" }
// ─────────────────────────────────────────────────────────────────────────────

const VALID_ROLES = ["CATALOG_OWNER", "ADMIN", "SUPERVISOR"] as const;

router.post(
  "/catalogs/:catalogId/members",
  requirePlan("AGENCY"),
  requireCatalogAccess("ADMIN"),
  async (req: Request, res: Response) => {
    const catalogId = req.params.catalogId as string;
    const { email, role } = req.body ?? {};

    if (typeof email !== "string") {
      res.status(400).json({ error: "email is required" });
      return;
    }
    if (!VALID_ROLES.includes(role)) {
      res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(", ")}` });
      return;
    }

    const invitee = await prisma.user.findUnique({ where: { email } });
    if (!invitee) {
      res.status(404).json({ error: `No user found with email ${email}` });
      return;
    }

    // ADMIN cannot grant CATALOG_OWNER
    const reqAuth = (req as AuthReq).auth!;
    const myMembership = await prisma.catalogMember.findUnique({
      where: { catalogId_userId: { catalogId, userId: reqAuth.userId } },
    });
    if (
      role === "CATALOG_OWNER" &&
      !catalogRoleAtLeast(myMembership?.role ?? "", "CATALOG_OWNER")
    ) {
      res.status(403).json({ error: "Only a CATALOG_OWNER can grant the CATALOG_OWNER role" });
      return;
    }

    const member = await prisma.catalogMember.upsert({
      where: { catalogId_userId: { catalogId, userId: invitee.id } },
      update: { role },
      create: { catalogId, userId: invitee.id, role },
    });

    res.status(201).json({ userId: invitee.id, email: invitee.email, role: member.role });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/catalogs/:catalogId/members/:userId
// Remove a member. CATALOG_OWNER can remove anyone; ADMIN can remove SUPERVISOR.
// ─────────────────────────────────────────────────────────────────────────────

router.delete(
  "/catalogs/:catalogId/members/:userId",
  requirePlan("AGENCY"),
  requireCatalogAccess("ADMIN"),
  async (req: Request, res: Response) => {
    const catalogId = req.params.catalogId as string;
    const userId = req.params.userId as string;
    const reqAuth = (req as AuthReq).auth!;

    if (userId === reqAuth.userId) {
      res.status(400).json({ error: "Cannot remove yourself" });
      return;
    }

    const target = await prisma.catalogMember.findUnique({
      where: { catalogId_userId: { catalogId, userId } },
    });
    if (!target) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    // ADMINs cannot remove CATALOG_OWNERs
    const myMembership = await prisma.catalogMember.findUnique({
      where: { catalogId_userId: { catalogId, userId: reqAuth.userId } },
    });
    if (
      target.role === "CATALOG_OWNER" &&
      !catalogRoleAtLeast(myMembership?.role ?? "", "CATALOG_OWNER")
    ) {
      res.status(403).json({ error: "Cannot remove a CATALOG_OWNER" });
      return;
    }

    await prisma.catalogMember.delete({
      where: { catalogId_userId: { catalogId, userId } },
    });

    res.status(204).send();
  }
);

export default router;
