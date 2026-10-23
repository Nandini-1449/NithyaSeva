const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
  const area = typeof req.query.area === "string" ? req.query.area.trim().slice(0, 160) : "";
  const skill = typeof req.query.skill === "string" ? req.query.skill.trim().slice(0, 80) : "";
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 50);
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);

  try {
    const result = await pool.query(
      `SELECT u.id, u.full_name, p.bio, p.skills, p.experience_years, p.service_area,
              p.hourly_rate, p.availability_status, p.updated_at
       FROM worker_profiles p
       JOIN users u ON u.id = p.user_id
       WHERE u.role = 'worker' AND u.account_status = 'active'
         AND ($1 = '' OR u.full_name ILIKE '%' || $1 || '%' OR p.bio ILIKE '%' || $1 || '%')
         AND ($2 = '' OR p.service_area ILIKE '%' || $2 || '%')
         AND ($3 = '' OR EXISTS (SELECT 1 FROM unnest(p.skills) s WHERE s ILIKE '%' || $3 || '%'))
       ORDER BY CASE p.availability_status WHEN 'available' THEN 0 WHEN 'busy' THEN 1 ELSE 2 END,
                p.updated_at DESC
       LIMIT $4 OFFSET $5`,
      [search, area, skill, limit, offset]
    );
    res.json({ success: true, workers: result.rows, pagination: { limit, offset } });
  } catch (error) {
    console.error("Worker listing error:", error.message);
    res.status(500).json({ success: false, message: "Could not load worker profiles." });
  }
});

router.get("/me", requireAuth, requireRole("worker"), async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT user_id, bio, skills, experience_years, service_area, hourly_rate, availability_status, created_at, updated_at FROM worker_profiles WHERE user_id = $1",
      [req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: "Worker profile not found." });
    res.json({ success: true, profile: result.rows[0] });
  } catch (error) {
    console.error("Worker profile error:", error.message);
    res.status(500).json({ success: false, message: "Could not load your profile." });
  }
});

router.put("/me", requireAuth, requireRole("worker"), async (req, res) => {
  const { bio, skills, experienceYears, serviceArea, hourlyRate, availabilityStatus } = req.body || {};
  if (bio !== undefined && (typeof bio !== "string" || bio.length > 4000)) {
    return res.status(400).json({ success: false, message: "Bio must be text of at most 4,000 characters." });
  }
  if (skills !== undefined && (!Array.isArray(skills) || skills.length > 30 || skills.some(s => typeof s !== "string" || !s.trim() || s.trim().length > 80))) {
    return res.status(400).json({ success: false, message: "Skills must be a list of up to 30 non-empty labels, each at most 80 characters." });
  }
  if (experienceYears !== undefined && (!Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 60)) {
    return res.status(400).json({ success: false, message: "Experience must be a whole number between 0 and 60." });
  }
  if (serviceArea !== undefined && (typeof serviceArea !== "string" || serviceArea.trim().length > 160)) {
    return res.status(400).json({ success: false, message: "Service area must be text of at most 160 characters." });
  }
  if (hourlyRate !== undefined && hourlyRate !== null && (!Number.isFinite(Number(hourlyRate)) || Number(hourlyRate) < 0 || Number(hourlyRate) > 10000000)) {
    return res.status(400).json({ success: false, message: "Hourly rate must be a non-negative amount." });
  }
  if (availabilityStatus !== undefined && !["available", "busy", "unavailable"].includes(availabilityStatus)) {
    return res.status(400).json({ success: false, message: "Availability must be available, busy, or unavailable." });
  }

  try {
    const result = await pool.query(
      `UPDATE worker_profiles SET
         bio = COALESCE($2, bio),
         skills = COALESCE($3::text[], skills),
         experience_years = COALESCE($4, experience_years),
         service_area = COALESCE($5, service_area),
         hourly_rate = CASE WHEN $6::boolean THEN $7::numeric ELSE hourly_rate END,
         availability_status = COALESCE($8, availability_status),
         updated_at = NOW()
       WHERE user_id = $1
       RETURNING user_id, bio, skills, experience_years, service_area, hourly_rate, availability_status, created_at, updated_at`,
      [req.user.id, bio === undefined ? null : bio.trim(), skills === undefined ? null : skills.map(s => s.trim()),
       experienceYears === undefined ? null : experienceYears, serviceArea === undefined ? null : serviceArea.trim(),
       hourlyRate !== undefined, hourlyRate === null || hourlyRate === undefined ? null : Number(hourlyRate), availabilityStatus || null]
    );
    res.json({ success: true, profile: result.rows[0] });
  } catch (error) {
    console.error("Worker profile update error:", error.message);
    res.status(500).json({ success: false, message: "Could not update your profile." });
  }
});

router.get("/:id", async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ success: false, message: "Invalid worker ID." });
  try {
    const result = await pool.query(
      `SELECT u.id, u.full_name, p.bio, p.skills, p.experience_years, p.service_area,
              p.hourly_rate, p.availability_status, p.updated_at
       FROM worker_profiles p JOIN users u ON u.id = p.user_id
       WHERE u.id = $1 AND u.role = 'worker' AND u.account_status = 'active'`,
      [req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: "Worker not found." });
    res.json({ success: true, worker: result.rows[0] });
  } catch (error) {
    console.error("Worker detail error:", error.message);
    res.status(500).json({ success: false, message: "Could not load this worker." });
  }
});

module.exports = router;
