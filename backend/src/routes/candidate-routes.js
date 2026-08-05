import { Router } from "express";

import {
  addCandidate,
  listCandidates,
  removeCandidate,
  updateCandidate,
} from "../controllers/candidate-controllers.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";

// Candidates live under two base paths, so this router is mounted at /api and
// declares the full paths itself. It must be mounted BEFORE the elections
// router: that one applies a blanket requireRole("ADMIN") to everything under
// /api/elections, which would 403 a student before the AUTH-level list below
// ever ran.
const router = Router();

// AUTH-level: students need the ballot list. Lean shape, no tallies.
router.get("/elections/:electionId/candidates", requireAuth, listCandidates);

router.post(
  "/elections/:electionId/candidates",
  requireAuth,
  requireRole("ADMIN"),
  addCandidate
);

router.patch("/candidates/:id", requireAuth, requireRole("ADMIN"), updateCandidate);
router.delete("/candidates/:id", requireAuth, requireRole("ADMIN"), removeCandidate);

export default router;
