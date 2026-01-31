const mongoose = require("mongoose");

const roles = [
  "Admin",
  "Management Staff",
  "Board Member",
  "Resident",
  "Tenant",
  "Security",
  "Vendor",
  "Contractor",
];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: roles, required: true },
    // 🟢 NEW: Added Block and Unit
    block: { type: String, default: "" },
    unit: { type: String, default: "" },
    phone: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);