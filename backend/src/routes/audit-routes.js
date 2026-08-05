import { Router } from "express";

import { listAudit } from "../controllers/audit-controllers.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";

const router = Router();

// The one endpoint AUDITOR exists for. The role is read-only oversight: it can
// see the trail of what everyone else did, and it can reach nothing else in the
// system — no results, no students, no elections, and above all no ballots.
// The gate sits on the router rather than the route so a second audit endpoint
// added later inherits it instead of having to remember it.
router.use(requireAuth, requireRole("ADMIN", "AUDITOR"));

router.get("/", listAudit);

export default router;
