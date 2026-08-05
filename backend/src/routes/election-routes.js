import { Router } from "express";

import {
  closeElection,
  createElection,
  deleteElection,
  getElection,
  listElections,
  openElection,
  publishElection,
  reopenElection,
  scheduleElection,
  unscheduleElection,
  updateElection,
} from "../controllers/election-controllers.js";
import {
  checkIntegrity,
  getResults,
  getTurnout,
} from "../controllers/results-controllers.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";

const router = Router();

// ADMIN-only for the whole resource. Students never read elections from here —
// their eligible ballots come from the /me/* routes in B6.
router.use(requireAuth, requireRole("ADMIN"));

router.get("/", listElections);
router.post("/", createElection);

router.get("/:id", getElection);
router.patch("/:id", updateElection);
router.delete("/:id", deleteElection);

// Light transitions.
router.post("/:id/schedule", scheduleElection);
router.post("/:id/unschedule", unscheduleElection);

// Heavy transitions. /open freezes eligibleCount and enforces the contest and
// concurrency rules; /reopen is separate on purpose so the dangerous path has
// its own guards and its own SENSITIVE audit event.
// Results, turnout and integrity (B7). ADMIN-only by the router gate above —
// which is exactly right here: there is no public results endpoint (rule 8).
router.get("/:id/results", getResults);
router.get("/:id/turnout", getTurnout);
router.get("/:id/integrity", checkIntegrity);

router.post("/:id/open", openElection);
router.post("/:id/close", closeElection);
router.post("/:id/reopen", reopenElection);
router.post("/:id/publish", publishElection);

export default router;
