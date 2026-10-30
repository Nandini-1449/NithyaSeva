const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const router = express.Router();

const idOk = value => /^\d+$/.test(String(value || ""));
const amountOk = value => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100000000;

// Agreed price: only the customer who owns the job can set/change it,
// and only for an assigned worker before completion.
// Update the rate using the worker ID shown in the customer's assigned-worker list.
router.patch("/jobs/:jobId/workers/:workerId/rate", requireAuth, requireRole("customer"), async (req, res) => {
  const { jobId, workerId } = req.params;
  const price = Number(req.body.agreedPrice);
  if (!idOk(jobId) || !idOk(workerId) || !amountOk(req.body.agreedPrice)) return res.status(400).json({ success:false, message:"Enter a valid agreed price." });
  try {
    const result = await pool.query(
      `UPDATE job_assignments a SET agreed_price=$1
       FROM jobs j WHERE a.job_id=j.id AND j.id=$2 AND a.worker_id=$3 AND j.customer_id=$4
       AND a.status IN ('accepted','in_progress')
       RETURNING a.id,a.job_id,a.worker_id,a.agreed_price,a.status`,
      [price, jobId, workerId, req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ success:false, message:"No active assignment for this worker was found under your job. Refresh My Jobs and try again." });
    await pool.query("UPDATE job_agreements SET agreed_price=$1, updated_at=NOW() WHERE job_id=$2 AND worker_id=$3 AND status='accepted'",[price,jobId,workerId]);
    res.json({ success:true, agreement:result.rows[0] });
  } catch (e) { console.error("Rate update:",e.message); res.status(500).json({success:false,message:"Could not save agreed price."}); }
});

// Backward-compatible assignment-ID endpoint; resolve by the verified assignment row.
router.patch("/jobs/:jobId/assignments/:assignmentId/rate", requireAuth, requireRole("customer"), async (req, res) => {
  const { jobId, assignmentId } = req.params;
  const price = Number(req.body.agreedPrice);
  if (!idOk(jobId) || !idOk(assignmentId) || !amountOk(req.body.agreedPrice)) return res.status(400).json({ success:false, message:"Enter a valid agreed price." });
  try {
    const result = await pool.query(
      `UPDATE job_assignments a SET agreed_price=$1
       FROM jobs j WHERE a.job_id=j.id AND j.id=$2 AND a.id=$3 AND j.customer_id=$4
       AND a.status IN ('accepted','in_progress')
       RETURNING a.id,a.job_id,a.worker_id,a.agreed_price,a.status`,
      [price,jobId,assignmentId,req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ success:false, message:"No active assignment was found for this job. Refresh My Jobs and retry." });
    await pool.query("UPDATE job_agreements SET agreed_price=$1, updated_at=NOW() WHERE job_id=$2 AND worker_id=$3 AND status='accepted'",[price,jobId,result.rows[0].worker_id]);
    res.json({success:true,agreement:result.rows[0]});
  } catch(e) { console.error("Rate update:",e.message); res.status(500).json({success:false,message:"Could not save agreed price."}); }
});

// Payment records are bookkeeping only. No money is transferred by this endpoint.
router.post("/jobs/:jobId/payments", requireAuth, async (req, res) => {
  const { jobId } = req.params;
  const amount = Number(req.body.amount);
  const method = typeof req.body.paymentMethod === "string" ? req.body.paymentMethod.trim().slice(0,30) : "offline";
  if (!idOk(jobId) || !Number.isFinite(amount) || amount <= 0 || amount > 100000000) return res.status(400).json({success:false,message:"Enter a valid payment amount."});
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const job = await client.query(
      `SELECT j.id,j.customer_id,j.status,a.worker_id,a.agreed_price
       FROM jobs j JOIN job_assignments a ON a.job_id=j.id
       WHERE j.id=$1 AND a.status <> 'cancelled' AND (j.customer_id=$2 OR a.worker_id=$2)
       FOR UPDATE OF j,a`, [jobId,req.user.id]
    );
    if (!job.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({success:false,message:"Job assignment not found."}); }
    const row=job.rows[0];
    if (String(req.user.id)!==String(row.customer_id)) { await client.query("ROLLBACK"); return res.status(403).json({success:false,message:"Only the customer can record a payment."}); }
    if (row.status!=="completed") { await client.query("ROLLBACK"); return res.status(409).json({success:false,message:"Payments can be recorded after job completion."}); }
    if (row.agreed_price !== null && amount > Number(row.agreed_price)) { await client.query("ROLLBACK"); return res.status(400).json({success:false,message:"Payment cannot exceed the agreed assignment price."}); }
    const saved=await client.query(
      "INSERT INTO payments(job_id,payer_id,payee_id,amount,payment_method,status) VALUES($1,$2,$3,$4,$5,'pending') RETURNING id,job_id,payer_id,payee_id,amount,currency,payment_method,status,created_at",
      [jobId,row.customer_id,row.worker_id,amount,method]
    );
    await client.query("COMMIT");
    res.status(201).json({success:true,payment:saved.rows[0],notice:"Payment record saved as pending. This app does not transfer money."});
  } catch(e) { await client.query("ROLLBACK").catch(()=>{}); console.error("Payment record:",e.message); res.status(500).json({success:false,message:"Could not record payment."}); }
  finally { client.release(); }
});

router.get("/payments/mine", requireAuth, async (req,res) => {
  try {
    const result=await pool.query(
      `SELECT p.id,p.job_id,j.title,p.amount,p.currency,p.payment_method,p.status,p.created_at,
       payer.full_name AS payer_name,payee.full_name AS payee_name
       FROM payments p JOIN jobs j ON j.id=p.job_id
       JOIN users payer ON payer.id=p.payer_id JOIN users payee ON payee.id=p.payee_id
       WHERE p.payer_id=$1 OR p.payee_id=$1 ORDER BY p.created_at DESC LIMIT 100`,
      [req.user.id]);
    res.json({success:true,payments:result.rows});
  } catch(e) { console.error("Payment history:",e.message); res.status(500).json({success:false,message:"Could not load payment history."}); }
});

router.get("/ledger/mine", requireAuth, requireRole("worker"), async (req,res) => {
  try {
    const result=await pool.query(
      `SELECT p.id,p.job_id,j.title,p.amount,p.currency,p.payment_method,p.status,p.created_at
       FROM payments p JOIN jobs j ON j.id=p.job_id
       WHERE p.payee_id=$1 ORDER BY p.created_at DESC LIMIT 100`,[req.user.id]);
    const totals=await pool.query(
      "SELECT COALESCE(SUM(amount) FILTER (WHERE status='succeeded'),0)::numeric(12,2) AS received, COALESCE(SUM(amount) FILTER (WHERE status='pending'),0)::numeric(12,2) AS pending FROM payments WHERE payee_id=$1",[req.user.id]);
    res.json({success:true,entries:result.rows,totals:totals.rows[0]});
  } catch(e) { console.error("Ledger:",e.message); res.status(500).json({success:false,message:"Could not load worker ledger."}); }
});

router.post("/jobs/:jobId/reviews", requireAuth, async (req,res) => {
  const {jobId}=req.params; const rating=Number(req.body.rating);
  const comment=typeof req.body.comment==="string"?req.body.comment.trim():"";
  if(!idOk(jobId)||!Number.isInteger(rating)||rating<1||rating>5||comment.length>2000) return res.status(400).json({success:false,message:"Rating must be 1–5 and comment at most 2,000 characters."});
  try {
    const job=await pool.query(
      `SELECT j.customer_id,a.worker_id FROM jobs j JOIN job_assignments a ON a.job_id=j.id
       WHERE j.id=$1 AND j.status='completed' AND a.status='completed'
       AND (j.customer_id=$2 OR a.worker_id=$2) LIMIT 1`,[jobId,req.user.id]);
    if(!job.rowCount) return res.status(409).json({success:false,message:"Reviews are available to job participants after completion."});
    const other=String(req.user.id)===String(job.rows[0].customer_id)?job.rows[0].worker_id:job.rows[0].customer_id;
    const saved=await pool.query(
      "INSERT INTO reviews(job_id,reviewer_id,reviewee_id,rating,comment) VALUES($1,$2,$3,$4,$5) ON CONFLICT(job_id,reviewer_id) DO NOTHING RETURNING id,job_id,rating,comment,created_at",
      [jobId,req.user.id,other,rating,comment||null]);
    if(!saved.rowCount) return res.status(409).json({success:false,message:"You have already reviewed this job."});
    res.status(201).json({success:true,review:saved.rows[0]});
  } catch(e) { console.error("Review:",e.message); res.status(500).json({success:false,message:"Could not submit review."}); }
});

router.get("/reviews/worker/:workerId", async (req,res) => {
  if(!idOk(req.params.workerId)) return res.status(400).json({success:false,message:"Invalid worker ID."});
  try {
    const result=await pool.query(
      "SELECT r.id,r.rating,r.comment,r.created_at,u.full_name AS reviewer_name,j.title AS job_title FROM reviews r JOIN users u ON u.id=r.reviewer_id JOIN jobs j ON j.id=r.job_id WHERE r.reviewee_id=$1 ORDER BY r.created_at DESC LIMIT 50",
      [req.params.workerId]);
    res.json({success:true,reviews:result.rows});
  } catch(e) { console.error("Reviews:",e.message); res.status(500).json({success:false,message:"Could not load reviews."}); }
});

router.post("/jobs/:jobId/disputes", requireAuth, async (req,res) => {
  const {jobId}=req.params; const reason=typeof req.body.reason==="string"?req.body.reason.trim().slice(0,80):"";
  const description=typeof req.body.description==="string"?req.body.description.trim():"";
  if(!idOk(jobId)||!reason||description.length<10||description.length>5000) return res.status(400).json({success:false,message:"Choose a reason and provide 10–5,000 characters of detail."});
  try {
    const job=await pool.query(
      `SELECT j.customer_id,a.worker_id FROM jobs j JOIN job_assignments a ON a.job_id=j.id
       WHERE j.id=$1 AND (j.customer_id=$2 OR a.worker_id=$2) LIMIT 1`,[jobId,req.user.id]);
    if(!job.rowCount) return res.status(404).json({success:false,message:"Job participation not found."});
    const against=String(req.user.id)===String(job.rows[0].customer_id)?job.rows[0].worker_id:job.rows[0].customer_id;
    const saved=await pool.query(
      "INSERT INTO job_disputes(job_id,opened_by,against_user,reason,description) VALUES($1,$2,$3,$4,$5) RETURNING id,job_id,reason,description,status,created_at",
      [jobId,req.user.id,against,reason,description]);
    res.status(201).json({success:true,dispute:saved.rows[0]});
  } catch(e) { console.error("Dispute:",e.message); res.status(500).json({success:false,message:"Could not open dispute. Apply the Phase 5 migration first."}); }
});

router.get("/disputes/mine", requireAuth, async (req,res) => {
  try {
    const result=await pool.query(
      `SELECT d.id,d.job_id,j.title,d.reason,d.description,d.status,d.resolution,d.created_at,d.updated_at,
       opener.full_name AS opened_by_name,against.full_name AS against_name
       FROM job_disputes d JOIN jobs j ON j.id=d.job_id
       JOIN users opener ON opener.id=d.opened_by JOIN users against ON against.id=d.against_user
       WHERE ($2::boolean = TRUE OR d.opened_by=$1 OR d.against_user=$1) ORDER BY d.created_at DESC LIMIT 100`,[req.user.id,req.user.role==="admin"]);
    res.json({success:true,disputes:result.rows});
  } catch(e) { console.error("Disputes:",e.message); res.status(500).json({success:false,message:"Could not load disputes."}); }
});

router.patch("/admin/disputes/:id", requireAuth, requireRole("admin"), async (req,res) => {
  if(!idOk(req.params.id)||!["under_review","resolved","closed"].includes(req.body.status)) return res.status(400).json({success:false,message:"Invalid dispute update."});
  const resolution=typeof req.body.resolution==="string"?req.body.resolution.trim().slice(0,5000):"";
  if(["resolved","closed"].includes(req.body.status)&&resolution.length<5) return res.status(400).json({success:false,message:"Add a resolution note of at least 5 characters."});
  try {
    const result=await pool.query(
      "UPDATE job_disputes SET status=$1,resolution=$2,resolved_by=$3,updated_at=NOW() WHERE id=$4 RETURNING id,status,resolution,updated_at",
      [req.body.status,resolution||null,req.user.id,req.params.id]);
    if(!result.rowCount) return res.status(404).json({success:false,message:"Dispute not found."});
    res.json({success:true,dispute:result.rows[0]});
  } catch(e) { console.error("Dispute update:",e.message); res.status(500).json({success:false,message:"Could not update dispute."}); }
});

module.exports=router;
