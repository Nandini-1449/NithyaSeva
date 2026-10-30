const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const uploadDir = path.join(__dirname, "..", "..", "uploads", "work-photos");
fs.mkdirSync(uploadDir, { recursive: true });

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, allowedTypes.has(file.mimetype))
});

async function canAccessJob(jobId, user) {
  const result = await pool.query(
    "SELECT j.customer_id, EXISTS (SELECT 1 FROM job_assignments a WHERE a.job_id = j.id AND a.worker_id = $2 AND a.status <> 'cancelled') AS is_assigned FROM jobs j WHERE j.id = $1",
    [jobId, user.id]
  );
  if (!result.rowCount) return { exists: false, allowed: false };
  return { exists: true, allowed: user.role === "admin" || String(result.rows[0].customer_id) === String(user.id) || (user.role === "worker" && result.rows[0].is_assigned) };
}

router.get("/jobs/:jobId/photos", requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.jobId)) return res.status(400).json({ success: false, message: "Invalid job ID." });
  try {
    const access = await canAccessJob(req.params.jobId, req.user);
    if (!access.exists) return res.status(404).json({ success: false, message: "Job not found." });
    if (!access.allowed) return res.status(403).json({ success: false, message: "You are not allowed to view this job's photos." });
    const result = await pool.query(
      "SELECT p.id, p.job_id, p.worker_id, p.phase, p.original_name, p.mime_type, p.size_bytes, p.created_at, u.full_name AS worker_name FROM job_work_photos p JOIN users u ON u.id = p.worker_id WHERE p.job_id = $1 ORDER BY p.created_at DESC",
      [req.params.jobId]
    );
    res.json({ success: true, photos: result.rows });
  } catch (error) {
    console.error("Work photo list error:", error.message);
    res.status(500).json({ success: false, message: "Could not load work photos." });
  }
});

router.post("/jobs/:jobId/photos", requireAuth, (req, res, next) => {
  if (req.user.role !== "worker") return res.status(403).json({ success: false, message: "Only assigned workers can upload work photos." });
  next();
}, (req, res, next) => upload.single("photo")(req, res, error => {
  if (error) {
    const message = error.code === "LIMIT_FILE_SIZE" ? "Photo must be 5 MB or smaller." : "Upload a JPG, PNG, or WebP image.";
    return res.status(400).json({ success: false, message });
  }
  if (!req.file) return res.status(400).json({ success: false, message: "Choose a valid image file." });
  next();
}), async (req, res) => {
  if (!/^\d+$/.test(req.params.jobId)) {

    return res.status(400).json({ success: false, message: "Invalid job ID." });
  }
  const phase = req.body.phase;
  if (!["before", "after"].includes(phase)) {

    return res.status(400).json({ success: false, message: "Photo stage must be before or after work." });
  }
  try {
    const access = await canAccessJob(req.params.jobId, req.user);
    if (!access.exists || !access.allowed || req.user.role !== "worker") {

      return res.status(access.exists ? 403 : 404).json({ success: false, message: "Only an assigned worker can upload photos for this job." });
    }
    const result = await pool.query(
      "INSERT INTO job_work_photos (job_id, worker_id, phase, storage_name, original_name, mime_type, size_bytes, image_data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, job_id, worker_id, phase, original_name, mime_type, size_bytes, created_at",
      [req.params.jobId, req.user.id, phase, crypto.randomUUID(), path.basename(req.file.originalname).slice(0, 255), req.file.mimetype, req.file.size, req.file.buffer]
    );
    res.status(201).json({ success: true, message: "Work photo uploaded.", photo: result.rows[0] });
  } catch (error) {

    console.error("Work photo upload error:", error.message);
    res.status(500).json({ success: false, message: "Could not save work photo." });
  }
});

router.get("/photos/:photoId", requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.photoId)) return res.status(400).json({ success: false, message: "Invalid photo ID." });
  try {
    const result = await pool.query(
      "SELECT p.job_id, p.storage_name, p.mime_type, p.image_data FROM job_work_photos p WHERE p.id = $1",
      [req.params.photoId]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: "Photo not found." });
    const access = await canAccessJob(result.rows[0].job_id, req.user);
    if (!access.allowed) return res.status(403).json({ success: false, message: "You are not allowed to view this photo." });
    res.setHeader("Content-Type", result.rows[0].mime_type);
    res.setHeader("Cache-Control", "private, no-store");
    if (result.rows[0].image_data) return res.end(result.rows[0].image_data);
    const filePath = path.join(uploadDir, path.basename(result.rows[0].storage_name || ""));
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: "This older photo is missing from local storage. Please upload it again." });
    return res.sendFile(filePath);
  } catch (error) {
    console.error("Work photo retrieval error:", error.message);
    return res.status(500).json({ success: false, message: "Could not open work photo." });
  }
});

module.exports = router;
