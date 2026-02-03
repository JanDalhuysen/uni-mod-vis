const express = require("express");
const app = express();
const path = require("path");
const { parseModules } = require("./utils/parser");

const PORT = process.env.PORT || 3000;

// Set up EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// API Endpoint to get modules
app.get("/api/modules", (req, res) => {
  try {
    const modules = parseModules();
    res.json(modules);
  } catch (err) {
    console.error("Error parsing modules:", err);
    res.status(500).json({ error: "Failed to parse modules" });
  }
});

// Main Route
app.get("/", (req, res) => {
  res.render("index");
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
