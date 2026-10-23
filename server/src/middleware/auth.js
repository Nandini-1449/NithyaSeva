const jwt = require("jsonwebtoken");
const pool = require("../db");

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ success: false, message: "A valid bearer token is required." });

  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(503).json({ success: false, message: "Authentication is not configured." });

  try {
    const payload = jwt.verify(match[1], secret);
    const result = await pool.query(
      "SELECT id, full_name, email, phone, role, account_status FROM users WHERE id = $1",
      [payload.sub]
    );
    const user = result.rows[0];
    if (!user || user.account_status !== "active") {
      return res.status(401).json({ success: false, message: "This account is unavailable." });
    }
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, message: "Your session is invalid or expired. Please log in again." });
    }
    console.error("Authentication middleware error:", error.message);
    return res.status(500).json({ success: false, message: "Could not verify your session." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "You do not have permission to perform this action." });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
