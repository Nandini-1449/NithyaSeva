const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

async function verifyConversationAccess(jobId, workerId, userId) {
  const result = await pool.query(
    "SELECT j.id AS job_id, j.customer_id, a.worker_id FROM jobs j JOIN job_assignments a ON a.job_id = j.id WHERE j.id = $1 AND a.worker_id = $2 AND a.status <> 'cancelled' AND (j.customer_id = $3 OR a.worker_id = $3)",
    [jobId, workerId, userId]
  );
  return result.rows[0] || null;
}

router.get("/conversations", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT a.job_id, a.worker_id, j.title AS job_title, CASE WHEN j.customer_id = $1 THEN a.worker_id ELSE j.customer_id END AS other_user_id, CASE WHEN j.customer_id = $1 THEN worker.full_name ELSE customer.full_name END AS other_user_name, latest.message AS last_message, latest.created_at AS last_message_at, (SELECT COUNT(*)::int FROM chat_messages unread WHERE unread.job_id = a.job_id AND unread.worker_id = a.worker_id AND unread.sender_user_id <> $1 AND unread.read_at IS NULL) AS unread_count FROM job_assignments a JOIN jobs j ON j.id = a.job_id JOIN users customer ON customer.id = j.customer_id JOIN users worker ON worker.id = a.worker_id LEFT JOIN LATERAL (SELECT message, created_at FROM chat_messages WHERE job_id = a.job_id AND worker_id = a.worker_id ORDER BY id DESC LIMIT 1) latest ON TRUE WHERE a.status <> 'cancelled' AND (j.customer_id = $1 OR a.worker_id = $1) ORDER BY COALESCE(latest.created_at, a.accepted_at) DESC",
      [req.user.id]
    );
    res.json({ success: true, conversations: result.rows });
  } catch (error) {
    console.error("Chat conversation list error:", error.message);
    res.status(500).json({ success: false, message: "Could not load your conversations." });
  }
});

router.get("/jobs/:jobId/workers/:workerId/messages", requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.jobId) || !/^\d+$/.test(req.params.workerId)) {
    return res.status(400).json({ success: false, message: "Invalid conversation ID." });
  }
  try {
    const access = await verifyConversationAccess(req.params.jobId, req.params.workerId, req.user.id);
    if (!access) return res.status(403).json({ success: false, message: "Chat is available only to the customer and assigned worker." });
    await pool.query(
      "UPDATE chat_messages SET read_at = NOW() WHERE job_id = $1 AND worker_id = $2 AND sender_user_id <> $3 AND read_at IS NULL",
      [req.params.jobId, req.params.workerId, req.user.id]
    );
    const result = await pool.query(
      "SELECT recent.id, recent.sender_user_id, recent.message, recent.created_at, u.full_name AS sender_name FROM (SELECT id, sender_user_id, message, created_at FROM chat_messages WHERE job_id = $1 AND worker_id = $2 ORDER BY id DESC LIMIT 100) recent JOIN users u ON u.id = recent.sender_user_id ORDER BY recent.id ASC",
      [req.params.jobId, req.params.workerId]
    );
    res.json({ success: true, messages: result.rows });
  } catch (error) {
    console.error("Chat message list error:", error.message);
    res.status(500).json({ success: false, message: "Could not load messages." });
  }
});

router.post("/jobs/:jobId/workers/:workerId/messages", requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.jobId) || !/^\d+$/.test(req.params.workerId)) {
    return res.status(400).json({ success: false, message: "Invalid conversation ID." });
  }
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message || message.length > 2000) {
    return res.status(400).json({ success: false, message: "Message must contain between 1 and 2,000 characters." });
  }
  try {
    const access = await verifyConversationAccess(req.params.jobId, req.params.workerId, req.user.id);
    if (!access) return res.status(403).json({ success: false, message: "Chat is available only to the customer and assigned worker." });
    const saved = await pool.query(
      "INSERT INTO chat_messages (job_id, worker_id, sender_user_id, message) VALUES ($1, $2, $3, $4) RETURNING id, job_id, worker_id, sender_user_id, message, created_at",
      [req.params.jobId, req.params.workerId, req.user.id, message]
    );
    res.status(201).json({ success: true, message: "Message sent.", chatMessage: saved.rows[0] });
  } catch (error) {
    console.error("Chat send error:", error.message);
    res.status(500).json({ success: false, message: "Could not send your message." });
  }
});

module.exports = router;
