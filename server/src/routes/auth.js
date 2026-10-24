const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");

const router = express.Router();

function createToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === "replace_with_a_long_random_value") {
    throw new Error("JWT_SECRET must be set to a private random value in server/.env");
  }

  return jwt.sign(
    { sub: String(user.id), role: user.role },
    secret,
    { expiresIn: "2h" }
  );
}

router.post("/register", async (req, res) => {
  const fullName = typeof req.body.fullName === "string" ? req.body.fullName.trim() : "";
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : null;
  const role = req.body.role === "worker" ? "worker" : req.body.role === "customer" || !req.body.role ? "customer" : null;

  if (!fullName || fullName.length > 120) {
    return res.status(400).json({ success: false, message: "Full name is required and must be 120 characters or fewer." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    return res.status(400).json({ success: false, message: "Enter a valid email address." });
  }
  if (password.length < 8 || password.length > 72) {
    return res.status(400).json({ success: false, message: "Password must be between 8 and 72 characters." });
  }
  if (!role) {
    return res.status(400).json({ success: false, message: "Role must be customer or worker. Admin accounts cannot be registered publicly." });
  }

  let client;
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    client = await pool.connect();
    await client.query("BEGIN");

    const result = await client.query(
      "INSERT INTO users (full_name, email, password_hash, phone, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, full_name, email, phone, role, account_status, created_at",
      [fullName, email, passwordHash, phone || null, role]
    );
    const user = result.rows[0];

    if (role === "worker") {
      await client.query("INSERT INTO worker_profiles (user_id) VALUES ($1)", [user.id]);
    }

    await client.query("COMMIT");
    const token = createToken(user);
    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      token,
      user
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505") {
      return res.status(409).json({ success: false, message: "An account of this type with this email already exists. You can use the other account type with the same email." });
    }
    if (error.message && error.message.includes("JWT_SECRET")) {
      return res.status(500).json({ success: false, message: "Server authentication is not configured yet." });
    }
    console.error("Registration error:", error.message);
    return res.status(500).json({ success: false, message: "Could not create the account. Please try again." });
  } finally {
    if (client) client.release();
  }
});

router.post("/login", async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const role = req.body.role === "worker" ? "worker" : req.body.role === "customer" ? "customer" : null;

  if (!email || !password || !role) {
    return res.status(400).json({ success: false, message: "Email, password, and account type are required." });
  }

  try {
    const result = await pool.query(
      "SELECT id, full_name, email, phone, role, account_status, password_hash FROM users WHERE email = $1 AND role = $2",
      [email, role]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }
    if (user.account_status !== "active") {
      return res.status(403).json({ success: false, message: "This account is not currently active." });
    }

    const token = createToken(user);
    delete user.password_hash;
    return res.json({ success: true, message: "Login successful.", token, user });
  } catch (error) {
    if (error.message && error.message.includes("JWT_SECRET")) {
      return res.status(500).json({ success: false, message: "Server authentication is not configured yet." });
    }
    console.error("Login error:", error.message);
    return res.status(500).json({ success: false, message: "Could not log in. Please try again." });
  }
});

module.exports = router;
