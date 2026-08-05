import { Router } from "express";

import {
  adminIssueOtp,
  logout,
  me,
  refresh,
  requestOtp,
  verifyOtp,
} from "../controllers/auth-controllers.js";
import { requireAuth } from "../middleware/auth.js";
import { otpRequestLimiter } from "../middleware/rate-limit.js";
import { requireRole } from "../middleware/role.js";

const router = Router();

// PUBLIC. Rate-limited per EMAIL, not per IP — campus shares NAT.
router.post("/request-otp", otpRequestLimiter, requestOtp);

// PUBLIC. Guarded by the stored code's own expiry, single-use flag and
// attempt cap rather than by a limiter.
router.post("/verify-otp", verifyOtp);

// PUBLIC*, in that it carries no Authorization header — the httpOnly refresh
// cookie is the credential. Rotates on every use with reuse detection.
router.post("/refresh", refresh);

router.post("/logout", requireAuth, logout);
router.get("/me", requireAuth, me);

// Availability fallback — an admin reads a login code to a student directly.
router.post("/admin/issue-otp", requireAuth, requireRole("ADMIN"), adminIssueOtp);

export default router;
