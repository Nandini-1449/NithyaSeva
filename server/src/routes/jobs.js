const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "open";
  const category = typeof req.query.category === "string" ? req.query.category.trim().slice(0, 100) : "";
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 50);
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
  if (!["open", "assigned", "in_progress", "completed", "cancelled", "all"].includes(status)) {
    return res.status(400).json({ success: false, message: "Invalid job status filter." });
  }
  try {
    const result = await pool.query(
      `SELECT j.id, j.title, j.description, j.category, j.category_id, j.service_location,
              j.budget, j.scheduled_for, j.status, j.created_at, j.updated_at,
              u.id AS customer_id, u.full_name AS customer_name
       FROM jobs j JOIN users u ON u.id = j.customer_id
       WHERE ($1 = 'all' OR j.status = $1)
         AND ($2 = '' OR j.category ILIKE '%' || $2 || '%')
         AND ($3 = '' OR j.title ILIKE '%' || $3 || '%' OR j.description ILIKE '%' || $3 || '%')
       ORDER BY j.created_at DESC LIMIT $4 OFFSET $5`,
      [status, category, search, limit, offset]
    );
    res.json({ success: true, jobs: result.rows, pagination: { limit, offset } });
  } catch (error) {
    console.error("Job listing error:", error.message);
    res.status(500).json({ success: false, message: "Could not load jobs." });
  }
});

router.post("/", requireAuth, requireRole("customer"), async (req, res) => {
  const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
  const description = typeof req.body.description === "string" ? req.body.description.trim() : "";
  const category = typeof req.body.category === "string" ? req.body.category.trim() : "";
  const serviceLocation = typeof req.body.serviceLocation === "string" ? req.body.serviceLocation.trim() : "";
  const budget = req.body.budget === undefined || req.body.budget === null || req.body.budget === "" ? null : Number(req.body.budget);
  const scheduledFor = req.body.scheduledFor || null;
  const workerCount = req.body.workerCount === undefined || req.body.workerCount === null || req.body.workerCount === "" ? 1 : Number(req.body.workerCount);
  if (!title || title.length > 160) return res.status(400).json({ success: false, message: "Title is required and must be at most 160 characters." });
  if (!description || description.length > 10000) return res.status(400).json({ success: false, message: "Description is required and must be at most 10,000 characters." });
  if (!category || category.length > 100) return res.status(400).json({ success: false, message: "Category is required and must be at most 100 characters." });
  if (!serviceLocation || serviceLocation.length > 1000) return res.status(400).json({ success: false, message: "Service location is required and must be at most 1,000 characters." });
  if (budget !== null && (!Number.isFinite(budget) || budget < 0 || budget > 100000000)) return res.status(400).json({ success: false, message: "Budget must be a non-negative amount." });
  if (!Number.isInteger(workerCount) || workerCount < 1 || workerCount > 10000) return res.status(400).json({ success: false, message: "Number of workers must be between 1 and 10,000." });
  if (scheduledFor !== null && (typeof scheduledFor !== "string" || Number.isNaN(Date.parse(scheduledFor)))) return res.status(400).json({ success: false, message: "Scheduled date must be a valid date/time." });
  if (scheduledFor && Date.parse(scheduledFor) < Date.now()) return res.status(400).json({ success: false, message: "Scheduled date/time must be in the future." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const categorySlug = category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "service";
    const categoryResult = await client.query(
      `INSERT INTO service_categories (name, slug)
       VALUES ($1, $2 || '-' || substr(md5($1), 1, 8))
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [category, categorySlug]
    );
    const result = await client.query(
      `INSERT INTO jobs (customer_id, title, description, category, category_id, service_location, budget, scheduled_for, worker_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, customer_id, title, description, category, category_id, service_location, budget, scheduled_for, worker_count, status, created_at`,
      [req.user.id, title, description, category, categoryResult.rows[0].id, serviceLocation, budget, scheduledFor, workerCount]
    );
    await client.query(
      "INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id) VALUES ($1, 'job.created', 'job', $2)",
      [req.user.id, String(result.rows[0].id)]
    );
    await client.query("COMMIT");
    res.status(201).json({ success: true, message: "Job posted successfully.", job: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Job creation error:", error.message);
    res.status(500).json({ success: false, message: "Could not post this job." });
  } finally {
    client.release();
  }
});

router.get("/mine", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, title, description, category, service_location, budget, scheduled_for, status, created_at, updated_at FROM jobs WHERE customer_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json({ success: true, jobs: result.rows });
  } catch (error) {
    console.error("Customer jobs error:", error.message);
    res.status(500).json({ success: false, message: "Could not load your jobs." });
  }
});

router.get("/:id", async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ success: false, message: "Invalid job ID." });
  try {
    const result = await pool.query(
      `SELECT j.id, j.title, j.description, j.category, j.category_id, j.service_location,
              j.budget, j.scheduled_for, j.status, j.created_at, j.updated_at,
              u.id AS customer_id, u.full_name AS customer_name
       FROM jobs j JOIN users u ON u.id = j.customer_id WHERE j.id = $1`,
      [req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: "Job not found." });
    res.json({ success: true, job: result.rows[0] });
  } catch (error) {
    console.error("Job detail error:", error.message);
    res.status(500).json({ success: false, message: "Could not load this job." });
  }
});

router.post("/:id/applications", requireAuth, requireRole("worker"), async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ success: false, message: "Invalid job ID." });
  const proposedPrice = req.body.proposedPrice === undefined || req.body.proposedPrice === null || req.body.proposedPrice === "" ? null : Number(req.body.proposedPrice);
  const message = typeof req.body.message === "string" ? req.body.message.trim() : null;
  if (proposedPrice !== null && (!Number.isFinite(proposedPrice) || proposedPrice < 0 || proposedPrice > 100000000)) return res.status(400).json({ success: false, message: "Proposed price must be a non-negative amount." });
  if (message && message.length > 3000) return res.status(400).json({ success: false, message: "Application message must be at most 3,000 characters." });
  try {
    const job = await pool.query("SELECT id, customer_id, status FROM jobs WHERE id = $1", [req.params.id]);
    if (!job.rowCount || job.rows[0].status !== "open") return res.status(404).json({ success: false, message: "Open job not found." });
    if (String(job.rows[0].customer_id) === String(req.user.id)) return res.status(403).json({ success: false, message: "You cannot apply to your own job." });
    const profile = await pool.query("SELECT availability_status FROM worker_profiles WHERE user_id = $1", [req.user.id]);
    if (!profile.rowCount || profile.rows[0].availability_status !== "available") return res.status(409).json({ success: false, message: "Set your worker availability to available before applying." });
    const result = await pool.query(
      "INSERT INTO job_applications (job_id, worker_id, proposed_price, message) VALUES ($1,$2,$3,$4) ON CONFLICT (job_id, worker_id) DO NOTHING RETURNING id, job_id, worker_id, proposed_price, message, status, created_at",
      [req.params.id, req.user.id, proposedPrice, message || null]
    );
    if (!result.rowCount) return res.status(409).json({ success: false, message: "You have already applied to this job." });
    await pool.query(
      "INSERT INTO notifications (user_id, notification_type, title, message, related_job_id) VALUES ($1, 'job.application', 'New job application', $2, $3)",
      [job.rows[0].customer_id, "A worker has applied to your job.", req.params.id]
    );
    res.status(201).json({ success: true, message: "Application submitted.", application: result.rows[0] });
  } catch (error) {
    console.error("Job application error:", error.message);
    res.status(500).json({ success: false, message: "Could not submit your application." });
  }
});

router.get("/:id/applications", requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ success: false, message: "Invalid job ID." });
  try {
    const job = await pool.query("SELECT customer_id FROM jobs WHERE id = $1", [req.params.id]);
    if (!job.rowCount) return res.status(404).json({ success: false, message: "Job not found." });
    if (String(job.rows[0].customer_id) !== String(req.user.id) && req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only the job owner can view its applications." });
    }
    const result = await pool.query(
      `SELECT a.id, a.job_id, a.worker_id, u.full_name AS worker_name,
              p.bio, p.skills, p.experience_years, p.service_area, p.hourly_rate,
              a.proposed_price, a.message, a.status, a.created_at
       FROM job_applications a JOIN users u ON u.id = a.worker_id
       LEFT JOIN worker_profiles p ON p.user_id = u.id
       WHERE a.job_id = $1 ORDER BY a.created_at ASC`,
      [req.params.id]
    );
    res.json({ success: true, applications: result.rows });
  } catch (error) {
    console.error("Application listing error:", error.message);
    res.status(500).json({ success: false, message: "Could not load applications." });
  }
});

router.post("/:id/applications/:applicationId/accept", requireAuth, requireRole("customer"), async (req, res) => {
  if (!/^\d+$/.test(req.params.id) || !/^\d+$/.test(req.params.applicationId)) return res.status(400).json({ success: false, message: "Invalid job or application ID." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const jobResult = await client.query("SELECT * FROM jobs WHERE id = $1 FOR UPDATE", [req.params.id]);
    const job = jobResult.rows[0];
    if (!job || String(job.customer_id) !== String(req.user.id)) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Job not found for this customer." });
    }
    if (job.status !== "open") {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, message: "This job is no longer open." });
    }
    const appResult = await client.query(
      "SELECT a.*, u.account_status FROM job_applications a JOIN users u ON u.id = a.worker_id WHERE a.id = $1 AND a.job_id = $2 FOR UPDATE",
      [req.params.applicationId, req.params.id]
    );
    const application = appResult.rows[0];
    if (!application || application.status !== "pending" || application.account_status !== "active") {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Pending application not found." });
    }
    const agreedPrice = application.proposed_price === null ? job.budget : application.proposed_price;
    if (agreedPrice === null || agreedPrice === undefined) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "This job has no budget and the worker proposed no price. Agree on a price before accepting." });
    }
    await client.query(
      "INSERT INTO job_assignments (job_id, worker_id, agreed_price, status) VALUES ($1,$2,$3,'accepted')",
      [job.id, application.worker_id, agreedPrice]
    );
    await client.query(
      "INSERT INTO job_agreements (job_id, customer_id, worker_id, agreed_price, scope_of_work, status, proposed_by, accepted_at) VALUES ($1,$2,$3,$4,$5,'accepted',$2,NOW())",
      [job.id, job.customer_id, application.worker_id, agreedPrice, job.description]
    );
    await client.query("UPDATE jobs SET status = 'assigned', updated_at = NOW() WHERE id = $1", [job.id]);
    await client.query("UPDATE job_applications SET status = CASE WHEN id = $1 THEN 'accepted' ELSE 'rejected' END, reviewed_at = NOW(), updated_at = NOW() WHERE job_id = $2 AND status = 'pending'", [application.id, job.id]);
    await client.query("UPDATE worker_profiles SET availability_status = 'busy', updated_at = NOW() WHERE user_id = $1", [application.worker_id]);
    await client.query(
      "INSERT INTO notifications (user_id, notification_type, title, message, related_job_id) VALUES ($1, 'application.accepted', 'Your application was accepted', $2, $3)",
      [application.worker_id, "The customer accepted your application and created a job agreement.", job.id]
    );
    await client.query("INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id) VALUES ($1, 'application.accepted', 'job', $2)", [req.user.id, String(job.id)]);
    await client.query("COMMIT");
    res.json({ success: true, message: "Worker selected and job agreement created.", jobId: job.id, workerId: application.worker_id, agreedPrice });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505") return res.status(409).json({ success: false, message: "This job has already been assigned." });
    console.error("Application acceptance error:", error.message);
    res.status(500).json({ success: false, message: "Could not accept this application." });
  } finally {
    client.release();
  }
});

router.patch("/:id/status", requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ success: false, message: "Invalid job ID." });
  const { status } = req.body || {};
  if (!["in_progress", "completed", "cancelled"].includes(status)) return res.status(400).json({ success: false, message: "Status must be in_progress, completed, or cancelled." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT j.*, a.worker_id, a.status AS assignment_status
       FROM jobs j LEFT JOIN job_assignments a ON a.job_id = j.id
       WHERE j.id = $1 FOR UPDATE OF j`,
      [req.params.id]
    );
    const job = result.rows[0];
    if (!job) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Job not found." });
    }
    const isCustomer = String(job.customer_id) === String(req.user.id);
    const isWorker = job.worker_id && String(job.worker_id) === String(req.user.id);
    if (!isCustomer && !isWorker && req.user.role !== "admin") {
      await client.query("ROLLBACK");
      return res.status(403).json({ success: false, message: "Only the customer or assigned worker can update this job." });
    }
    if (status === "in_progress") {
      if (!isWorker || job.status !== "assigned") {
        await client.query("ROLLBACK");
        return res.status(409).json({ success: false, message: "Only the assigned worker can start an assigned job." });
      }
      await client.query("UPDATE jobs SET status = 'in_progress', updated_at = NOW() WHERE id = $1", [job.id]);
      await client.query("UPDATE job_assignments SET status = 'in_progress' WHERE job_id = $1", [job.id]);
      await client.query("UPDATE job_agreements SET status = 'accepted', updated_at = NOW() WHERE job_id = $1 AND status = 'accepted'", [job.id]);
    } else if (status === "completed") {
      if (!isCustomer || job.status !== "in_progress") {
        await client.query("ROLLBACK");
        return res.status(409).json({ success: false, message: "The customer can confirm completion only after the worker marks the job in progress." });
      }
      await client.query("UPDATE jobs SET status = 'completed', updated_at = NOW() WHERE id = $1", [job.id]);
      await client.query("UPDATE job_assignments SET status = 'completed', completed_at = NOW() WHERE job_id = $1", [job.id]);
      await client.query("UPDATE job_agreements SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE job_id = $1", [job.id]);
      await client.query("UPDATE worker_profiles SET availability_status = 'available', updated_at = NOW() WHERE user_id = $1", [job.worker_id]);
    } else {
      if (!isCustomer || !["open", "assigned"].includes(job.status)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ success: false, message: "Only the customer can cancel an open or assigned job." });
      }
      await client.query("UPDATE jobs SET status = 'cancelled', updated_at = NOW() WHERE id = $1", [job.id]);
      await client.query("UPDATE job_assignments SET status = 'cancelled' WHERE job_id = $1", [job.id]);
      await client.query("UPDATE job_agreements SET status = 'cancelled', updated_at = NOW() WHERE job_id = $1 AND status <> 'completed'", [job.id]);
      if (job.worker_id) await client.query("UPDATE worker_profiles SET availability_status = 'available', updated_at = NOW() WHERE user_id = $1", [job.worker_id]);
    }
    await client.query("INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id) VALUES ($1, $2, 'job', $3)", [req.user.id, `job.${status}`, String(job.id)]);
    await client.query("COMMIT");
    res.json({ success: true, message: "Job status updated.", jobId: job.id, status });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Job status update error:", error.message);
    res.status(500).json({ success: false, message: "Could not update job status." });
  } finally {
    client.release();
  }
});

module.exports = router;
