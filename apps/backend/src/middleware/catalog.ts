import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { catalogRoleAtLeast, type CatalogRole } from "../lib/catalogRole";
import { type AuthPayload } from "./auth";

// Reads catalogId from req.params.catalogId OR req.query.catalogId.
// Returns middleware that checks the authenticated user is a member with
// at least minRole. Attaches resolved catalog to req.catalog on success.
export function requireCatalogAccess(minRole: CatalogRole) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as Request & { auth?: AuthPayload }).auth;
    if (!auth) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const catalogId =
      (req.params.catalogId as string | undefined) ??
      (req.query.catalogId as string | undefined);

    if (!catalogId) {
      res.status(400).json({ error: "catalogId required" });
      return;
    }

    const member = await prisma.catalogMember.findUnique({
      where: { catalogId_userId: { catalogId, userId: auth.userId } },
      include: { catalog: true },
    });

    if (!member) {
      res.status(404).json({ error: "Catalog not found or access denied" });
      return;
    }

    if (!catalogRoleAtLeast(member.role, minRole)) {
      res.status(403).json({
        error: `This action requires the ${minRole} catalog role. Your role: ${member.role}`,
      });
      return;
    }

    (req as Request & { catalog?: typeof member.catalog }).catalog = member.catalog;
    next();
  };
}
