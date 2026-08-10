const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// NOTE on phone verification: this MVP uses phone + password, which is
// simple to build and ship first. Algerian users will trust the app more
// once you add SMS OTP verification on signup (via a gateway like
// Twilio, Vonage, or a local Algerian SMS provider) — swap this route's
// logic for an OTP flow when you're ready; the rest of the API doesn't
// need to change since it only cares about the resulting JWT.

const phoneRegex = /^\+213[5-7]\d{8}$/; // Algerian mobile format

const registerSchema = z.object({
  phone: z.string().regex(phoneRegex, "Use format +213XXXXXXXXX"),
  name: z.string().min(2).optional(),
  password: z.string().min(6),
  language: z.enum(["fr", "ar", "en"]).optional(),
  address: z.string().min(3).optional(),
  postalCode: z.string().min(3).optional(),
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { phone, name, password, language, address, postalCode } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) return res.status(409).json({ error: "Phone already registered" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { phone, name, passwordHash, language: language || "fr", address, postalCode },
  });

  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

const loginSchema = z.object({
  phone: z.string(),
  password: z.string(),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { phone, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) return res.status(401).json({ error: "Invalid phone or password" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid phone or password" });

  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, phone: user.phone },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function publicUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

// ---- Current user profile ----
// Same account, same token format works whether the request comes from
// the website or the React Native app — neither needs its own auth logic.
router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: publicUser(user) });
});

const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  address: z.string().min(3).optional(),
  postalCode: z.string().min(3).optional(),
  language: z.enum(["fr", "ar", "en"]).optional(),
});

router.patch("/me", requireAuth, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const user = await prisma.user.update({ where: { id: req.user.id }, data: parsed.data });
  res.json({ user: publicUser(user) });
});

module.exports = router;
