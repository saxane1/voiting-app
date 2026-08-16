import { Router } from "express";

import {
  createUser,
  deactivateUser,
  listUsers,
  reactivateUser,
  updateUser,
} from "../controllers/adminstration-controllers.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";

const router = Router();

// B3b — elevated (ADMIN / AUDITOR) account management. The ENTIRE slice is
// ADMIN-only, applied at the router so a route added later cannot be left
// unguarded by omission.
//
// AUDITOR is refused here as firmly as STUDENT is. Read-only oversight that can
// grant itself a second account, or disable the admins it is meant to be
// watching, is not oversight — GET /api/audit remains the one endpoint the
// AUDITOR role exists for.
router.use(requireAuth, requireRole("ADMIN"));

router.get("/", listUsers);
router.post("/", createUser);

// Identity edits (name / email) only. The activation routes below are separate
// on purpose: they carry the root, self and last-admin guards, and folding them
// into a general-purpose PATCH would put those guards behind a field name.
router.patch("/:id", updateUser);

router.patch("/:id/deactivate", deactivateUser);
router.patch("/:id/reactivate", reactivateUser);

export default router;
