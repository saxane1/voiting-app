import { Router } from "express";

import {
  getMyBallot,
  getMyVotingStatus,
  listMyBallots,
} from "../controllers/vote-controllers.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";

// The voter-facing surface. Mounted at /api/me with its own STUDENT gate — these
// deliberately do NOT hang off the admin-gated elections router, which would
// 403 the very users they exist for.
//
// requireRole("STUDENT") means an ADMIN or AUDITOR token is refused here too:
// administrators are not voters, and /me has no meaning for them.
const router = Router();

router.use(requireAuth, requireRole("STUDENT"));

router.get("/ballots", listMyBallots);
router.get("/ballots/:electionId", getMyBallot);
router.get("/voting-status", getMyVotingStatus);

export default router;
