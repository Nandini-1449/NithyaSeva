require("dotenv").config();
const express = require("express");
const pool = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 5000);

app.use(express.json({ limit: "10kb" }));

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to the NithyaSeva API!",
    status: "running"
  });
});

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      success: true,
      message: "NithyaSeva backend and database are healthy"
    });
  } catch (error) {
    console.error("Health check database error:", error.message);
    res.status(503).json({
      success: false,
      message: "Backend is running, but the database is unavailable"
    });
  }
});

app.listen(PORT, () => {
  console.log(`NithyaSeva server running at http://localhost:${PORT}`);
});
