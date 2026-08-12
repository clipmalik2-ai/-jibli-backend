require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth");
const orderRoutes = require("./routes/orders");
const adminRoutes = require("./routes/admin");
const publicRoutes = require("./routes/public");
const messageRoutes = require("./routes/messages");

const app = express();
app.use(cors());
app.use(express.json());

// Serve uploaded payment-proof screenshots (swap for S3/Supabase Storage
// in production — a local disk folder won't survive most deploys).
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/orders", orderRoutes);
app.use("/admin", adminRoutes);
app.use("/public", publicRoutes);
app.use("/messages", messageRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Jibli backend running on http://localhost:${PORT}`));
