export type CatalogRole = "CATALOG_OWNER" | "ADMIN" | "SUPERVISOR";

const ROLE_RANK: Record<CatalogRole, number> = {
  SUPERVISOR: 0,
  ADMIN: 1,
  CATALOG_OWNER: 2,
};

export function catalogRoleAtLeast(actual: string, min: CatalogRole): boolean {
  return (ROLE_RANK[actual as CatalogRole] ?? -1) >= ROLE_RANK[min];
}
