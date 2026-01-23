// backend/server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("./models/User");

const app = express();

// ------------------------------
// MIDDLEWARE
// ------------------------------

// CORS – allow your React app
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://condo-management-website.vercel.app",
      "https://condo-management-website.vercel.app/" // Added this just in case!
    ],
    credentials: true
  })
);

// VERY IMPORTANT: parse JSON body
app.use(express.json());

// Debug: log every request body (for now)
app.use((req, res, next) => {
  console.log("🧪 Incoming", req.method, req.url, "body:", req.body);
  next();
});

const PORT = process.env.PORT || 5000;

// ------------------------------
// CONNECT TO MONGODB
// ------------------------------
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err.message));


// ROUTES
// ------------------------------

// 1. ROOT ROUTE (ADDED THIS)
app.get("/", (req, res) => {
  res.send("<h1>Backend is running! 🚀</h1>");
});

// HEALTH CHECK
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Condo backend is running",
  });
});

// REGISTER USER
app.post("/api/auth/register", async (req, res) => {
  try {
    // Safety: handle missing body
    if (!req.body) {
      return res.status(400).json({ message: "Missing JSON body" });
    }

    let { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Normalise role so "resident" → "Resident"
    role = role
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      passwordHash,
      role,
    });

    res.status(201).json({
      message: "User created",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// LOGIN USER
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const payload = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    res.json({
      message: "Login successful",
      token,
      user: payload,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ------------------------------
// START SERVER
// ------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});
