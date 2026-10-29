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
  const mode = req.query.mode === "nearby" ? "nearby" : "all";
  const latitude = req.query.latitude === undefined ? null : Number(req.query.latitude);
  const longitude = req.query.longitude === undefined ? null : Number(req.query.longitude);
  const radiusKm = req.query.radiusKm === undefined ? 25 : Number(req.query.radiusKm);
  if (!["open", "assigned", "in_progress", "completed", "cancelled", "all"].includes(status)) {
    return res.status(400).json({ success: false, message: "Invalid job status filter." });
  }
  if (mode === "nearby" && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
    return res.status(400).json({ success: false, message: "Share your location to search nearby jobs." });
  }
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 200) {
    return res.status(400).json({ success: false, message: "Distance must be between 1 and 200 km." });
  }
  try {
    const result = await pool.query(
      `SELECT j.id, j.title, j.description, j.category, j.category_id, j.service_location,
              j.latitude, j.longitude, j.budget, j.scheduled_for, j.worker_count, j.status, j.created_at, j.updated_at,
              CASE WHEN $6::double precision IS NULL OR j.latitude IS NULL OR j.longitude IS NULL THEN NULL
                ELSE ROUND((6371 * ACOS(LEAST(1, GREATEST(-1,
                  SIN(RADIANS($6)) * SIN(RADIANS(j.latitude)) +
                  COS(RADIANS($6)) * COS(RADIANS(j.latitude)) * COS(RADIANS(j.longitude) - RADIANS($7))
                ))))::numeric, 1) END AS distance_km,
              (SELECT COUNT(*)::int FROM job_assignments a WHERE a.job_id = j.id AND a.status <> 'cancelled') AS assigned_worker_count,
              GREATEST(j.worker_count - (SELECT COUNT(*)::int FROM job_assignments a WHERE a.job_id = j.id AND a.status <> 'cancelled'), 0) AS workers_needed,
              u.id AS customer_id, u.full_name AS customer_name
       FROM jobs j JOIN users u ON u.id = j.customer_id
       WHERE ($1 = 'all' OR j.status = $1)
         AND ($2 = '' OR j.category ILIKE '%' || $2 || '%')
         AND ($3 = '' OR j.title ILIKE '%' || $3 || '%' OR j.description ILIKE '%' || $3 || '%')
         AND ($8 = 'all' OR (j.latitude IS NOT NULL AND j.longitude IS NOT NULL AND
           6371 * ACOS(LEAST(1, GREATEST(-1,
             SIN(RADIANS($6)) * SIN(RADIANS(j.latitude)) +
             COS(RADIANS($6)) * COS(RADIANS(j.latitude)) * COS(RADIANS(j.longitude) - RADIANS($7))
           ))) <= $9))
       ORDER BY distance_km ASC NULLS LAST, j.created_at DESC
       LIMIT $4 OFFSET $5`,
      [status, category, search, limit, offset, mode === "nearby" ? latitude : null, mode === "nearby" ? longitude : null, mode, radiusKm]
    );
    res.json({ success: true, jobs: result.rows, pagination: { limit, offset }, locationMode: mode, radiusKm: mode === "nearby" ? radiusKm : null });
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
  const latitude = req.body.latitude === undefined || req.body.latitude === null || req.body.latitude === "" ? null : Number(req.body.latitude);
  const longitude = req.body.longitude === undefined || req.body.longitude === null || req.body.longitude === "" ? null : Number(req.body.longitude);
  if (!title || title.length > 160) return res.status(400).json({ success: false, message: "Title is required and must be at most 160 characters." });
  if (!description || description.length > 10000) return res.status(400).json({ success: false, message: "Description is required and must be at most 10,000 characters." });
  if (!category || category.length > 100) return res.status(400).json({ success: false, message: "Category is required and must be at most 100 characters." });
  if (!serviceLocation || serviceLocation.length > 1000) return res.status(400).json({ success: false, message: "Service location is required and must be at most 1,000 characters." });
  if (budget !== null && (!Number.isFinite(budget) || budget < 0 || budget > 100000000)) return res.status(400).json({ success: false, message: "Budget must be a non-negative amount." });
  if (!Number.isInteger(workerCount) || workerCount < 1 || workerCount > 10000) return res.status(400).json({ success: false, message: "Number of workers must be between 1 and 10,000." });
  if ((latitude === null) !== (longitude === null) || (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180))) return res.status(400).json({ success: false, message: "Location coordinates are invalid." });
  if (scheduledFor !== null && (typeof scheduledFor !== "string" || Number.isNaN(Date.parse(scheduledFor)))) return res.status(400).json({ success: false, message: "Scheduled date must be a valid date/time." });
  if (scheduledFor && Date.parse(scheduledFor) < Date.now()) return res.status(400).json({ success: false, message: "Scheduled date/time must be in the future." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const categorySlug = category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "service";
    const categoryResult = await client.query(
      `INSERT INTO service_categories (name, slug)
       VALUES ($1, $2 || '-' || substr(md5($2), 1, 8))
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [category, categorySlug]
    );
    const result = await client.query(
      `INSERT INTO jobs (customer_id, title, description, category, category_id, service_location, budget, scheduled_for, worker_count, latitude, longitude)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, customer_id, title, description, category, category_id, service_location, latitude, longitude, budget, scheduled_for, worker_count, status, created_at`,
      [req.user.id, title, description, category, categoryResult.rows[0].id, serviceLocation, budget, scheduledFor, workerCount, latitude, longitude]
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
      "SELECT j.id, j.title, j.description, j.category, j.service_location, j.budget, j.scheduled_for, j.worker_count, j.status, j.created_at, j.updated_at, (SELECT COUNT(*)::int FROM job_assignments a WHERE a.job_id = j.id AND a.status <> 'cancelled') AS assigned_worker_count, GREATEST(j.worker_count - (SELECT COUNT(*)::int FROM job_assignments a WHERE a.job_id = j.id AND a.status <> 'cancelled'), 0) AS workers_needed, COALESCE((SELECT json_agg(json_build_object('worker_id', u.id, 'worker_name', u.full_name, 'assignment_status', a.status) ORDER BY u.full_name) FROM job_assignments a JOIN users u ON u.id = a.worker_id WHERE a.job_id = j.id AND a.status <> 'cancelled'), '[]'::json) AS assigned_workers FROM jobs j WHERE j.customer_id = $1 ORDER BY j.created_at DESC",
      [req.user.id]
    );
    res.json({ success: true, jobs: result.rows });
  } catch (error) {
    console.error("Customer jobs error:", error.message);
    res.status(500).json({ success: false, message: "Could not load your jobs." });
  }
});

router.get("/assigned/mine", requireAuth, requireRole("worker"), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.id AS assignment_id, a.status AS assignment_status,
              a.worker_completed_at, a.customer_completed_at,
              a.cancellation_requested_at, a.cancellation_acknowledged_at,
              a.cancellation_requested_by,
              j.id AS job_id, j.title, j.description, j.category, j.service_location,
              j.budget, j.scheduled_for, j.status AS job_status, j.worker_count,
              u.full_name AS customer_name
       FROM job_assignments a
       JOIN jobs j ON j.id = a.job_id
       JOIN users u ON u.id = j.customer_id
       WHERE a.worker_id = $1
       ORDER BY a.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, assignments: result.rows });
  } catch (error) {
    console.error("Worker assignments error:", error.message);
    res.status(500).json({ success: false, message: "Could not load your assignments." });
  }
});

router.get("/:id", async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ success: false, message: "Invalid job ID." });
  try {
    const result = await pool.query(
      `SELECT j.id, j.title, j.description, j.category, j.category_id, j.service_location,
              j.budget, j.scheduled_for, j.worker_count, j.status, j.created_at, j.updated_at,
              (SELECT COUNT(*)::int FROM job_assignments a WHERE a.job_id = j.id AND a.status <> 'cancelled') AS assigned_worker_count,
              GREATEST(j.worker_count - (SELECT COUNT(*)::int FROM job_assignments a WHERE a.job_id = j.id AND a.status <> 'cancelled'), 0) AS workers_needed,
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
    const existingApplication = await pool.query(
      "SELECT id FROM job_applications WHERE job_id = $1 AND worker_id = $2 AND status IN ('pending', 'accepted') LIMIT 1",
      [req.params.id, req.user.id]
    );
    if (existingApplication.rowCount) {
      return res.status(409).json({ success: false, message: "You already have an active application for this job." });
    }
    const result = await pool.query(
      "INSERT INTO job_applications (job_id, worker_id, proposed_price, message, status) VALUES ($1,$2,$3,$4,'pending') RETURNING id, job_id, worker_id, proposed_price, message, status, created_at",
      [req.params.id, req.user.id, proposedPrice, message || null]
    );
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
       WHERE a.job_id = $1
         AND (
           $2 = 'admin'
           OR a.status = 'accepted'
           OR (a.status = 'pending' AND p.availability_status = 'available')
         )
       ORDER BY a.created_at ASC`,
      [req.params.id, req.user.role]
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
    if (!["open", "assigned"].includes(job.status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, message: "This job is no longer accepting workers." });
    }
    const assignedResult = await client.query(
      "SELECT COUNT(*)::int AS total FROM job_assignments WHERE job_id = $1 AND status <> 'cancelled'",
      [job.id]
    );
    const assignedCount = assignedResult.rows[0].total;
    if (assignedCount >= job.worker_count) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, message: "This job already has all requested workers." });
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
    const workerAvailability = await client.query(
      "SELECT availability_status FROM worker_profiles WHERE user_id = $1 FOR UPDATE",
      [application.worker_id]
    );
    if (!workerAvailability.rowCount || workerAvailability.rows[0].availability_status !== "available") {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, message: "This worker is already assigned to another job and is currently busy." });
    }
    const agreedPrice = application.proposed_price === null ? job.budget : application.proposed_price;
    if (agreedPrice === null || agreedPrice === undefined) {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "This job has no budget and the worker proposed no price. Agree on a price before accepting." });
    }
    const existingAssignment = await client.query(
      "SELECT 1 FROM job_assignments WHERE job_id = $1 AND worker_id = $2 AND status <> 'cancelled'",
      [job.id, application.worker_id]
    );
    if (existingAssignment.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, message: "This worker is already assigned to the job." });
    }
    await client.query(
      "INSERT INTO job_assignments (job_id, worker_id, agreed_price, status) VALUES ($1,$2,$3,'accepted')",
      [job.id, application.worker_id, agreedPrice]
    );
    await client.query(
      "INSERT INTO job_agreements (job_id, customer_id, worker_id, agreed_price, scope_of_work, status, proposed_by, accepted_at) VALUES ($1,$2,$3,$4,$5,'accepted',$2,NOW())",
      [job.id, job.customer_id, application.worker_id, agreedPrice, job.description]
    );
    await client.query(
      "UPDATE job_applications SET status = 'accepted', reviewed_at = NOW(), updated_at = NOW() WHERE id = $1",
      [application.id]
    );
    // Preserve application history but require workers to reapply after this job.
    await client.query(
      "UPDATE job_applications SET status = 'withdrawn', reviewed_at = NOW(), updated_at = NOW() WHERE worker_id = $1 AND id <> $2 AND status = 'pending'",
      [application.worker_id, application.id]
    );
    const newAssignedResult = await client.query(
      "SELECT COUNT(*)::int AS total FROM job_assignments WHERE job_id = $1 AND status <> 'cancelled'",
      [job.id]
    );
    const newAssignedCount = newAssignedResult.rows[0].total;
    const headcountReached = newAssignedCount >= job.worker_count;
    await client.query(
      "UPDATE jobs SET status = CASE WHEN $2 THEN 'assigned' ELSE 'open' END, updated_at = NOW() WHERE id = $1",
      [job.id, headcountReached]
    );
    if (headcountReached) {
      await client.query(
        "UPDATE job_applications SET status = 'rejected', reviewed_at = NOW(), updated_at = NOW() WHERE job_id = $1 AND status = 'pending'",
        [job.id]
      );
    }
    await client.query("UPDATE worker_profiles SET availability_status = 'busy', updated_at = NOW() WHERE user_id = $1", [application.worker_id]);
    await client.query(
      "INSERT INTO notifications (user_id, notification_type, title, message, related_job_id) VALUES ($1, 'application.accepted', 'Your application was accepted', $2, $3)",
      [application.worker_id, "The customer accepted your application and created a job agreement.", job.id]
    );
    await client.query("INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id) VALUES ($1, 'application.accepted', 'job', $2)", [req.user.id, String(job.id)]);
    await client.query("COMMIT");
    res.json({ success: true, message: headcountReached ? "Requested worker count reached. The job is now assigned." : "Worker selected. The job remains open while more workers are needed.", jobId: job.id, workerId: application.worker_id, agreedPrice, assignedWorkerCount: newAssignedCount, workerCount: job.worker_count, workersNeeded: Math.max(job.worker_count - newAssignedCount, 0), headcountReached });
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
    const jobResult = await client.query("SELECT * FROM jobs WHERE id = $1 FOR UPDATE", [req.params.id]);
    const job = jobResult.rows[0];
    if (!job) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Job not found." });
    }
    const isCustomer = String(job.customer_id) === String(req.user.id);
    const isAdmin = req.user.role === "admin";
    const assignmentResult = await client.query(
      "SELECT * FROM job_assignments WHERE job_id = $1 AND worker_id = $2 AND status <> 'cancelled' FOR UPDATE",
      [job.id, req.user.id]
    );
    const assignment = assignmentResult.rows[0];
    const isAssignedWorker = Boolean(assignment);
    if (!isCustomer && !isAssignedWorker && !isAdmin) {
      await client.query("ROLLBACK");
      return res.status(403).json({ success: false, message: "Only the customer, an assigned worker, or an admin can update this job." });
    }

    if (status === "in_progress") {
      if (!isAssignedWorker || !["assigned", "in_progress"].includes(job.status) || assignment.status !== "accepted") {
        await client.query("ROLLBACK");
        return res.status(409).json({ success: false, message: "Only an accepted worker can start work on this job." });
      }
      await client.query("UPDATE job_assignments SET status = 'in_progress' WHERE id = $1", [assignment.id]);
      await client.query("UPDATE jobs SET status = 'in_progress', updated_at = NOW() WHERE id = $1", [job.id]);
      await client.query("COMMIT");
      return res.json({ success: true, message: "Work marked as in progress.", jobId: job.id, status: "in_progress" });
    }

    if (status === "completed") {
      if (!["in_progress", "assigned"].includes(job.status) || (!isCustomer && !isAssignedWorker && !isAdmin)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ success: false, message: "This job is not eligible for completion confirmation." });
      }
      if (isAssignedWorker) {
        if (!["in_progress", "accepted"].includes(assignment.status)) {
          await client.query("ROLLBACK");
          return res.status(409).json({ success: false, message: "This assignment cannot be marked complete." });
        }
        await client.query("UPDATE job_assignments SET worker_completed_at = COALESCE(worker_completed_at, NOW()) WHERE id = $1", [assignment.id]);
      } else {
        await client.query(
          "UPDATE job_assignments SET customer_completed_at = COALESCE(customer_completed_at, NOW()) WHERE job_id = $1 AND status IN ('accepted', 'in_progress')",
          [job.id]
        );
      }

      await client.query(
        "UPDATE job_assignments SET status = 'completed', completed_at = NOW() WHERE job_id = $1 AND status IN ('accepted', 'in_progress') AND worker_completed_at IS NOT NULL AND customer_completed_at IS NOT NULL",
        [job.id]
      );
      await client.query(
        "UPDATE job_agreements SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE job_id = $1 AND worker_id IN (SELECT worker_id FROM job_assignments WHERE job_id = $1 AND status = 'completed') AND status <> 'cancelled'",
        [job.id]
      );
      await client.query(
        "UPDATE worker_profiles SET availability_status = 'available', updated_at = NOW() WHERE user_id IN (SELECT worker_id FROM job_assignments WHERE job_id = $1 AND status = 'completed')",
        [job.id]
      );
      const totals = await client.query(
        "SELECT COUNT(*) FILTER (WHERE status <> 'cancelled')::int AS active_total, COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_total FROM job_assignments WHERE job_id = $1",
        [job.id]
      );
      const allDone = totals.rows[0].active_total > 0 && totals.rows[0].active_total === totals.rows[0].completed_total;
      if (allDone) await client.query("UPDATE jobs SET status = 'completed', updated_at = NOW() WHERE id = $1", [job.id]);
      await client.query("COMMIT");
      return res.json({ success: true, message: "Completion confirmation saved. A worker becomes available only after both parties confirm.", jobId: job.id, status: allDone ? "completed" : "in_progress" });
    }

    if (status === "cancelled") {
      if (!isCustomer && !isAssignedWorker && !isAdmin) {
        await client.query("ROLLBACK");
        return res.status(403).json({ success: false, message: "Only the customer, an assigned worker, or an admin can request cancellation." });
      }
      if (["open", "assigned"].includes(job.status)) {
        if (!isCustomer && !isAdmin) {
          await client.query("ROLLBACK");
          return res.status(403).json({ success: false, message: "Before work starts, only the customer or admin can cancel this job." });
        }
        await client.query("UPDATE jobs SET status = 'cancelled', updated_at = NOW() WHERE id = $1", [job.id]);
        await client.query("UPDATE job_assignments SET status = 'cancelled', cancellation_requested_at = NOW(), cancellation_acknowledged_at = NOW(), cancellation_requested_by = $2 WHERE job_id = $1 AND status IN ('accepted', 'in_progress')", [job.id, req.user.id]);
        await client.query("UPDATE job_agreements SET status = 'cancelled', updated_at = NOW() WHERE job_id = $1 AND status <> 'completed'", [job.id]);
        await client.query("UPDATE worker_profiles SET availability_status = 'available', updated_at = NOW() WHERE user_id IN (SELECT worker_id FROM job_assignments WHERE job_id = $1 AND status = 'cancelled')", [job.id]);
        await client.query("UPDATE job_applications SET status = 'withdrawn', reviewed_at = NOW(), updated_at = NOW() WHERE job_id = $1 AND status = 'pending'", [job.id]);
        await client.query("COMMIT");
        return res.json({ success: true, message: "Job cancelled before work started; assigned workers have been released.", jobId: job.id, status: "cancelled" });
      }

      if (job.status !== "in_progress") {
        await client.query("ROLLBACK");
        return res.status(409).json({ success: false, message: "This job cannot be cancelled in its current state." });
      }
      const cancelTarget = isAssignedWorker ? assignment : null;
      if (cancelTarget) {
        if (!cancelTarget.cancellation_requested_at) {
          await client.query("UPDATE job_assignments SET cancellation_requested_at = NOW(), cancellation_requested_by = $2 WHERE id = $1", [cancelTarget.id, req.user.id]);
          await client.query("COMMIT");
          return res.json({ success: true, message: "Cancellation requested. The customer must acknowledge it before this worker is released.", jobId: job.id, status: "cancellation_pending" });
        }
        if (String(cancelTarget.cancellation_requested_by) === String(req.user.id)) {
          await client.query("ROLLBACK");
          return res.status(409).json({ success: false, message: "Waiting for the other party to acknowledge cancellation." });
        }
        await client.query("UPDATE job_assignments SET cancellation_acknowledged_at = NOW(), status = 'cancelled' WHERE id = $1", [cancelTarget.id]);
        await client.query("UPDATE job_agreements SET status = 'cancelled', updated_at = NOW() WHERE job_id = $1 AND worker_id = $2 AND status <> 'completed'", [job.id, cancelTarget.worker_id]);
        await client.query("UPDATE worker_profiles SET availability_status = 'available', updated_at = NOW() WHERE user_id = $1", [cancelTarget.worker_id]);
      } else {
        const pending = await client.query("SELECT * FROM job_assignments WHERE job_id = $1 AND status IN ('accepted', 'in_progress') AND cancellation_requested_at IS NOT NULL AND cancellation_acknowledged_at IS NULL FOR UPDATE", [job.id]);
        if (!pending.rowCount) {
          await client.query("UPDATE job_assignments SET cancellation_requested_at = NOW(), cancellation_requested_by = $2 WHERE job_id = $1 AND status IN ('accepted', 'in_progress') AND cancellation_requested_at IS NULL", [job.id, req.user.id]);
          await client.query("COMMIT");
          return res.json({ success: true, message: "Cancellation requested. Assigned workers must acknowledge before they are released.", jobId: job.id, status: "cancellation_pending" });
        }
        await client.query("UPDATE job_assignments SET cancellation_acknowledged_at = NOW(), status = 'cancelled' WHERE id = ANY($1::bigint[])", [pending.rows.filter(a => String(a.cancellation_requested_by) !== String(req.user.id)).map(a => a.id)]);
        await client.query("UPDATE job_agreements SET status = 'cancelled', updated_at = NOW() WHERE job_id = $1 AND worker_id IN (SELECT worker_id FROM job_assignments WHERE job_id = $1 AND status = 'cancelled') AND status <> 'completed'", [job.id]);
        await client.query("UPDATE worker_profiles SET availability_status = 'available', updated_at = NOW() WHERE user_id IN (SELECT worker_id FROM job_assignments WHERE job_id = $1 AND status = 'cancelled')", [job.id]);
      }
      const remaining = await client.query("SELECT COUNT(*)::int AS total FROM job_assignments WHERE job_id = $1 AND status IN ('accepted', 'in_progress')", [job.id]);
      if (remaining.rows[0].total === 0) await client.query("UPDATE jobs SET status = 'cancelled', updated_at = NOW() WHERE id = $1", [job.id]);
      await client.query("COMMIT");
      return res.json({ success: true, message: "Cancellation acknowledgement recorded.", jobId: job.id, status: remaining.rows[0].total === 0 ? "cancelled" : "in_progress" });
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Job status update error:", error.message);
    return res.status(500).json({ success: false, message: "Could not update job status." });
  } finally {
    client.release();
  }
});

module.exports = router;
