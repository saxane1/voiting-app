import { Router } from "express";

import { castVote } from "../controllers/vote-controllers.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";

// Voting hangs off /api/elections/:electionId/vote but is STUDENT-only, so it
// cannot live in the elections router (blanket ADMIN gate). Same mounting
// lesson as candidates: this router is mounted at /api BEFORE that one.
const router = Router();

router.post(
  "/elections/:electionId/vote",
  requireAuth,
  requireRole("STUDENT"),
  castVote
);

export default router;
