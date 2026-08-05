// RBAC gate — design rule 7. Mount AFTER requireAuth:
//   router.get("/elections", requireAuth, requireRole("ADMIN"), listElections)
//   router.get("/audit", requireAuth, requireRole("ADMIN", "AUDITOR"), listAudit)
//
// Students never pass this gate on admin routes; their access is limited to the
// /me/* routes, which carry requireAuth but no requireRole.

export function requireRole(...allowedRoles) {
  const allowed = new Set(allowedRoles);

  return function roleGuard(req, res, next) {
    // Defensive: only reachable if requireAuth was not mounted ahead of this.
    // Failing closed with 401 is safer than assuming a role.
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: "NO_TOKEN",
          message: "Authentication is required",
        },
      });
    }

    if (!allowed.has(req.user.role)) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "You do not have permission to access this resource",
        },
      });
    }

    next();
  };
}
