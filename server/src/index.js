
const express = require("express");

const app = express();
const PORT = 5000;

app.use(express.json());

// Welcome route
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to the NithyaSeva API!",
    status: "running"
  });
});

// Health check route
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "NithyaSeva backend is healthy"
  });
});

app.listen(PORT, () => {
  console.log(`NithyaSeva server running at http://localhost:${PORT}`);
});
