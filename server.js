require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("./models/User"); 

const app = express();

// ------------------------------
// 1. MIDDLEWARE
// ------------------------------
// Allow any website (Vercel) to talk to this backend
app.use(cors({ origin: "*" }));
app.use(express.json());

app.use((req, res, next) => {
  console.log("🧪 Incoming", req.method, req.url);
  next();
});

const PORT = process.env.PORT || 5000;

// ------------------------------
// 2. CONNECT TO MONGODB
// ------------------------------
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err.message));


// ==================================================================
// 3. MODELS
// ==================================================================

const bookingSchema = new mongoose.Schema({
  facility: String,
  date: String,
  time: String,
  userId: String,
  userName: String,
  userBlock: { type: String, default: "" }, 
  userUnit: { type: String, default: "" },
  status: { type: String, default: "Pending Payment" } 
});
const Booking = mongoose.model("Booking", bookingSchema);

const feeSchema = new mongoose.Schema({
  userId: String,
  desc: String,
  unit: { type: String, default: "Unit #01-01" },
  date: String,
  time: String,
  amount: Number,
  type: String, 
  status: { type: String, default: "Pending" },
  relatedBookingId: String 
});
const Fee = mongoose.model("Fee", feeSchema);

const visitorSchema = new mongoose.Schema({
  userId: String,
  residentName: String,
  residentUnit: String,
  name: String,
  date: String,
  vehicle: String,
  status: { type: String, default: "Pending" } 
});
const Visitor = mongoose.model("Visitor", visitorSchema);

const facilitySchema = new mongoose.Schema({
  name: String,
  rate: Number, 
  status: { type: String, default: "Available" }
});
const Facility = mongoose.model("Facility", facilitySchema);

const maintenanceSchema = new mongoose.Schema({
  userId: String,
  userName: String,
  request: String,
  location: String,
  comments: String,
  date: String,
  status: { type: String, default: "Pending" } 
});
const Maintenance = mongoose.model("Maintenance", maintenanceSchema);

const announcementSchema = new mongoose.Schema({
  title: String,
  body: String,
  type: String, 
  blockNo: String, 
  date: String
});
const Announcement = mongoose.model("Announcement", announcementSchema);

const surveySchema = new mongoose.Schema({
  title: String,
  desc: String,
  type: String, 
  status: { type: String, default: "LIVE" }, 
  meta: String, 
  responses: { type: Number, default: 0 },
  date: String
});
const Survey = mongoose.model("Survey", surveySchema);

const incidentSchema = new mongoose.Schema({
  title: String,
  location: String,
  time: String,
  reporter: String,
  status: { type: String, default: "Open" },
  description: String,
  date: String
});
const Incident = mongoose.model("Incident", incidentSchema);


// ==================================================================
// 4. AUTH ROUTES
// ==================================================================

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Condo backend is running" });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    if (!req.body) return res.status(400).json({ message: "Missing JSON body" });
    let { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) return res.status(400).json({ message: "All fields are required" });

    // Normalize role to Title Case (e.g. "admin" -> "Admin")
    role = role.split(" ").map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(" ");
    
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash, role, block: "", unit: "" });

    res.status(201).json({ message: "User created", user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "Email and password are required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid email or password" });

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return res.status(401).json({ message: "Invalid email or password" });

    const payload = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role, 
      block: user.block || "", 
      unit: user.unit || "", 
      phone: user.phone || "" 
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1d" });
    res.json({ message: "Login successful", token, user: payload });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


// ==================================================================
// 5. FEATURES
// ==================================================================

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: "Access Denied" });

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).json({ message: "Invalid Token" });
    }
};

// --- BOOKINGS ---
app.get("/api/bookings", async (req, res) => {
  try {
    const bookings = await Booking.find();
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

app.post("/api/bookings", verifyToken, async (req, res) => {
  try {
      const { facility, date, time } = req.body;
      const { id, name, block, unit } = req.user; 

      const newBooking = new Booking({
        facility, date, time, 
        userId: id, userName: name, 
        userBlock: block || "", userUnit: unit || "",
        status: "Pending Payment"
      });
      const savedBooking = await newBooking.save();

      let numberOfSlots = 0;
      if (Array.isArray(time)) {
          numberOfSlots = time.length;
      } else if (typeof time === 'string') {
          numberOfSlots = time.includes(",") ? time.split(",").length : 1;
      }

      let rate = (facility.includes("Tennis") || facility.includes("Badminton")) ? 5 : 10;
      let totalAmount = rate * numberOfSlots;

      if (totalAmount > 0) {
        await Fee.create({
          userId: id,
          desc: `Booking: ${facility}`,
          unit: unit ? `#${unit}` : "-",
          date, 
          time: Array.isArray(time) ? time.join(", ") : time, 
          amount: totalAmount, 
          type: "facility",
          relatedBookingId: savedBooking._id.toString()
        });
      }
      
      res.json(savedBooking);
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Booking failed" });
  }
});

app.delete("/api/bookings/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    await Booking.findByIdAndDelete(id);
    await Fee.findOneAndDelete({ relatedBookingId: id, status: "Pending" });
    res.json({ message: "Booking cancelled" });
  } catch (err) {
    res.status(500).json({ error: "Cancellation failed" });
  }
});

// --- FEES ---
app.get("/api/fees", verifyToken, async (req, res) => {
  try {
    const role = req.user.role ? req.user.role.toLowerCase() : "";
    const isStaff = ["admin", "management staff", "board member"].includes(role);
    
    // Admin sees ALL fees, Resident sees THEIR fees
    const query = isStaff ? {} : { userId: req.user.id };
    
    const fees = await Fee.find(query);
    res.json(fees);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch fees" });
  }
});

app.put("/api/fees/:id/pay", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const fee = await Fee.findByIdAndUpdate(id, { status: "Paid", date: new Date().toLocaleDateString("en-GB") }, { new: true });
    
    if (fee && fee.relatedBookingId) {
      await Booking.findByIdAndUpdate(fee.relatedBookingId, { status: "Confirmed" });
    }
    res.json({ message: "Paid successfully" });
  } catch (err) {
    res.status(500).json({ error: "Payment failed" });
  }
});

// --- VISITORS ---
app.get("/api/visitors", verifyToken, async (req, res) => {
  try {
    const role = req.user.role ? req.user.role.toLowerCase() : "";
    const isStaff = ["admin", "management staff", "board member", "security", "security personnel"].includes(role);
    
    let query;
    if (isStaff) {
        query = {}; // Staff sees everything
    } else {
        // Resident sees only their own entries OR visitors for their unit
        query = { 
            $or: [
                { userId: req.user.id },
                { residentUnit: req.user.unit }
            ]
        };
    }
    const visitors = await Visitor.find(query);
    res.json(visitors);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch visitors" });
  }
});

app.get("/api/visitors/all", verifyToken, async (req, res) => {
  try {
    const visitors = await Visitor.find();
    res.json(visitors);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch visitors" });
  }
});

app.post("/api/visitors", verifyToken, async (req, res) => {
  try {
    const { name, date, vehicle, status, manualResidentName, manualResidentUnit } = req.body;
    
    const role = req.user.role ? req.user.role.toLowerCase() : "";
    const isStaff = ["admin", "management staff", "board member", "security", "security personnel"].includes(role);

    const newVisitor = new Visitor({
      userId: req.user.id,
      residentName: (isStaff && manualResidentName) ? manualResidentName : req.user.name,
      residentUnit: (isStaff && manualResidentUnit) ? manualResidentUnit : (req.user.unit || "N/A"),
      name, date, vehicle,
      status: status || "Pending" 
    });
    
    const saved = await newVisitor.save();
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: "Failed to add visitor" });
  }
});

app.put("/api/visitors/:id", verifyToken, async (req, res) => {
  try {
    const updated = await Visitor.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});

app.delete("/api/visitors/:id", verifyToken, async (req, res) => {
  try {
    await Visitor.findByIdAndDelete(req.params.id);
    res.json({ message: "Visitor removed" });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
});

// --- FACILITY MANAGEMENT ---
app.get("/api/facilities", async (req, res) => {
  try {
    const facilities = await Facility.find();
    res.json(facilities);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch facilities" });
  }
});

app.post("/api/facilities", verifyToken, async (req, res) => {
  try {
    const { name, rate } = req.body;
    const newFacility = new Facility({ name, rate });
    await newFacility.save();
    res.json(newFacility);
  } catch (err) {
    res.status(500).json({ error: "Failed to create facility" });
  }
});

app.delete("/api/facilities/:id", verifyToken, async (req, res) => {
  try {
    await Facility.findByIdAndDelete(req.params.id);
    res.json({ message: "Facility removed" });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
});

// --- MAINTENANCE ---
app.get("/api/maintenance", async (req, res) => {
  try {
    const requests = await Maintenance.find().sort({ _id: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch maintenance records" });
  }
});

app.post("/api/maintenance", verifyToken, async (req, res) => {
  try {
    const { request, location, comments } = req.body;
    const newRequest = new Maintenance({
      userId: req.user.id,
      userName: req.user.name,
      request, location, comments,
      date: new Date().toLocaleDateString("en-GB")
    });
    await newRequest.save();
    res.json(newRequest);
  } catch (err) {
    res.status(500).json({ error: "Failed to submit request" });
  }
});

app.put("/api/maintenance/:id", verifyToken, async (req, res) => {
  try {
    const { status } = req.body;
    const updated = await Maintenance.findByIdAndUpdate(req.params.id, { status }, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});

app.delete("/api/maintenance/:id", verifyToken, async (req, res) => {
  try {
    await Maintenance.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
});

// --- ANNOUNCEMENTS ---
app.get("/api/announcements", async (req, res) => {
  try {
    const announcements = await Announcement.find().sort({ _id: -1 });
    res.json(announcements);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch announcements" });
  }
});

app.post("/api/announcements", verifyToken, async (req, res) => {
  try {
    const { title, body, type, blockNo } = req.body;
    const newAnn = new Announcement({
      title, body, type, blockNo,
      date: new Date().toLocaleDateString("en-GB")
    });
    await newAnn.save();
    res.json(newAnn);
  } catch (err) {
    res.status(500).json({ error: "Failed to post announcement" });
  }
});

app.delete("/api/announcements/:id", verifyToken, async (req, res) => {
  try {
    await Announcement.findByIdAndDelete(req.params.id);
    res.json({ message: "Announcement deleted" });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
});

// --- SURVEYS & POLLS ---
app.get("/api/surveys", async (req, res) => {
  try {
    const items = await Survey.find().sort({ _id: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch surveys" });
  }
});

app.post("/api/surveys", verifyToken, async (req, res) => {
  try {
    const { title, desc, type, meta } = req.body;
    const newItem = new Survey({
      title, desc, type, meta, 
      status: "LIVE",
      date: new Date().toLocaleDateString("en-GB")
    });
    await newItem.save();
    res.json(newItem);
  } catch (err) {
    res.status(500).json({ error: "Failed to create item" });
  }
});

app.put("/api/surveys/:id/respond", verifyToken, async (req, res) => {
  try {
    const item = await Survey.findByIdAndUpdate(req.params.id, { $inc: { responses: 1 } }, { new: true });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: "Failed to respond" });
  }
});

app.delete("/api/surveys/:id", verifyToken, async (req, res) => {
  try {
    await Survey.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
});

// --- INCIDENTS (SECURITY) ---
app.get("/api/incidents", async (req, res) => {
  try {
    const incidents = await Incident.find().sort({ _id: -1 });
    res.json(incidents);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch incidents" });
  }
});

app.post("/api/incidents", verifyToken, async (req, res) => {
  try {
    const { title, location, description } = req.body;
    const newIncident = new Incident({
      title, location, description,
      reporter: req.user.name,
      status: "Open",
      time: new Date().toLocaleTimeString("en-GB", { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toLocaleDateString("en-GB")
    });
    await newIncident.save();
    res.json(newIncident);
  } catch (err) {
    res.status(500).json({ error: "Failed to log incident" });
  }
});

app.put("/api/incidents/:id", verifyToken, async (req, res) => {
  try {
    const updated = await Incident.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});

app.delete("/api/incidents/:id", verifyToken, async (req, res) => {
  try {
    const role = req.user.role ? req.user.role.trim().toLowerCase() : "";
    if (role !== "admin" && role !== "management staff") {
        return res.status(403).json({ message: "Only Admins can delete incidents." });
    }
    await Incident.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
});


// ==================================================================
// 6. USER SETTINGS & MANAGEMENT
// ==================================================================

// 🟢 NEW: Get All Users (For Admin Residents Page)
app.get("/api/users", verifyToken, async (req, res) => {
  try {
    // Debug log to see who is asking
    console.log("Fetching users for:", req.user.role);

    // Case-insensitive role check
    const role = req.user.role ? req.user.role.toLowerCase() : "";
    const isPrivileged = ["admin", "management staff", "board member", "security"].includes(role);
    
    if (!isPrivileged) return res.status(403).json({ message: "Access Denied" });

    // Fetch all users
    const users = await User.find().select("-passwordHash");
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.put("/api/users/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, block, unit, phone } = req.body;

    // Residents can only update own profile. Admins can update anyone (optional, currently restricted)
    if (req.user.id !== id) {
      return res.status(403).json({ message: "You can only update your own profile" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      id, 
      { name, email, block, unit, phone }, 
      { new: true } 
    );

    if (!updatedUser) return res.status(404).json({ message: "User not found" });

    res.json({
      id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      block: updatedUser.block,
      unit: updatedUser.unit,
      phone: updatedUser.phone
    });

  } catch (err) {
    res.status(500).json({ message: "Failed to update profile" });
  }
});

// ------------------------------
// START SERVER
// ------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});