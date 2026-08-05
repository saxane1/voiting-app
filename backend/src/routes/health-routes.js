import { Router } from "express";

const router = Router();

// GET /api/health — liveness probe for the host (Railway / Lightsail) and for
// confirming the server booted. Intentionally does not touch the database.
router.get("/", (req, res) => {
  res.json({ ok: true });
});

export default router;
