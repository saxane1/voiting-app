import { Router } from "express";

import {
  createFaculty,
  deleteFaculty,
  listFaculties,
  updateFaculty,
} from "../controllers/faculty-controllers.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";

const router = Router();

// Any logged-in user — students need it to see their own faculty.
router.get("/", requireAuth, listFaculties);

router.post("/", requireAuth, requireRole("ADMIN"), createFaculty);
router.patch("/:id", requireAuth, requireRole("ADMIN"), updateFaculty);
router.delete("/:id", requireAuth, requireRole("ADMIN"), deleteFaculty);

export default router;
