const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

router.get("/notifications", requireAuth, async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 50);
  try {
    const result = await pool.query(
      "SELECT n.id, n.notification_type, n.title, CASE WHEN n.notification_type = 'application.accepted' AND n.message ILIKE 'The customer accepted your application%' THEN COALESCE((SELECT u.full_name FROM users u WHERE u.id = j.customer_id), 'The customer') || ' accepted your application and created a job agreement.' WHEN j.id IS NOT NULL AND n.message ILIKE '%worker%applied%' THEN COALESCE((SELECT u.full_name FROM job_applications a JOIN users u ON u.id = a.worker_id WHERE a.job_id = j.id ORDER BY ABS(EXTRACT(EPOCH FROM (a.created_at - n.created_at))) ASC LIMIT 1), 'A worker') || ' applied to your job: ' || j.title || '.' ELSE n.message END AS message, n.related_job_id, n.read_at, n.created_at, j.title AS job_title, j.description AS job_description, j.category AS job_category, j.service_location AS job_location, j.status AS job_status, j.worker_count AS workers_requested, (SELECT COUNT(*)::int FROM job_assignments a WHERE a.job_id = j.id AND a.status <> 'cancelled') AS workers_assigned, GREATEST(j.worker_count - (SELECT COUNT(*)::int FROM job_assignments a WHERE a.job_id = j.id AND a.status <> 'cancelled'), 0)::int AS workers_still_required FROM notifications n LEFT JOIN jobs j ON j.id = n.related_job_id WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT $2",
      [req.user.id, limit]
    );
    res.json({ success: true, notifications: result.rows });
  } catch (error) {
    console.error("Notification list error:", error.message);
    res.status(500).json({ success: false, message: "Could not load notifications." });
  }
});

router.patch("/notifications/:id/read", requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ success: false, message: "Invalid notification ID." });
  try {
    const result = await pool.query(
      "UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = $1 AND user_id = $2 RETURNING id, read_at",
      [req.params.id, req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: "Notification not found." });
    res.json({ success: true, notification: result.rows[0] });
  } catch (error) {
    console.error("Notification update error:", error.message);
    res.status(500).json({ success: false, message: "Could not update notification." });
  }
});

module.exports = router;
