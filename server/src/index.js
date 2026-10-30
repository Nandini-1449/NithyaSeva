require("dotenv").config();
const express = require("express");
const pool = require("./db");
const authRoutes = require("./routes/auth");
const workerRoutes = require("./routes/workers");
const jobRoutes = require("./routes/jobs");
const trustRoutes = require("./routes/trust");
const workProofRoutes = require("./routes/workProof");
const phase5Routes = require("./routes/phase5");
const chatRoutes = require("./routes/chat");

const app = express();
const PORT = Number(process.env.PORT || 5000);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

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

app.use("/api/auth", authRoutes);
app.use("/api/workers", workerRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api", trustRoutes);
app.use("/api/work-proof", workProofRoutes);
app.use("/api", phase5Routes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "API endpoint not found." });
});

app.listen(PORT, () => {
  console.log(`NithyaSeva server running at http://localhost:${PORT}`);
});
