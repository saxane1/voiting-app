import { Router } from "express";

import {
  bulkCreateStudents,
  createStudent,
  deactivateStudent,
  getStudent,
  listStudents,
  reactivateStudent,
  updateStudent,
} from "../controllers/student-controllers.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/role.js";
import { uploadExcel } from "../middleware/upload.js";

const router = Router();

// Every student-management route is ADMIN-only. Students reach their own data
// through /api/auth/me and (from B6) the /me/* voting routes, never through here.
router.use(requireAuth, requireRole("ADMIN"));

router.get("/", listStudents);
router.post("/", createStudent);

// Declared before "/:id" routes so "bulk" is never captured as an id.
router.post("/bulk", uploadExcel, bulkCreateStudents);

router.get("/:id", getStudent);
router.patch("/:id", updateStudent);
router.patch("/:id/deactivate", deactivateStudent);
router.patch("/:id/reactivate", reactivateStudent);

export default router;
