const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireAdmin);

// Order matters — an order can only move to the next stage in sequence,
// except REJECTED which can happen from PENDING (payment didn't match).
const STAGE_ORDER = ["PENDING", "PAID", "BOUGHT", "SHIPPED", "ARRIVED", "DELIVERED"];

// ---- List signed-up accounts (buyers) ----
router.get("/users", async (req, res) => {
  const { query } = req.query;
  const users = await prisma.user.findMany({
    where: query
      ? {
          OR: [
            { phone: { contains: String(query) } },
            { name: { contains: String(query) } },
          ],
        }
      : undefined,
    select: {
      id: true, phone: true, name: true, role: true, language: true,
      address: true, postalCode: true, createdAt: true,
      _count: { select: { orders: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ users });
});

// ---- List orders (with optional stage filter + search) ----
router.get("/orders", async (req, res) => {
  const { stage, query } = req.query;
  const orders = await prisma.order.findMany({
    where: {
      ...(stage ? { stage: String(stage) } : {}),
      ...(query
        ? {
            OR: [
              { reference: { contains: String(query) } },
              { productTitle: { contains: String(query) } },
              { buyer: { phone: { contains: String(query) } } },
              { buyer: { name: { contains: String(query) } } },
            ],
          }
        : {}),
    },
    include: { buyer: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ orders });
});

router.get("/orders/:id", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { buyer: true, exchangeRate: true, stageHistory: { orderBy: { createdAt: "asc" } } },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json({ order });
});

// ---- Confirm payment: PENDING -> PAID ----
router.post("/orders/:id/confirm-payment", async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.stage !== "PENDING") return res.status(400).json({ error: `Order is already ${order.stage}` });

  const updated = await advanceTo(order.id, "PAID");
  res.json({ order: updated });
});

// ---- Reject: PENDING -> REJECTED ----
const rejectSchema = z.object({ note: z.string().optional() });
router.post("/orders/:id/reject", async (req, res) => {
  const parsed = rejectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.stage !== "PENDING") return res.status(400).json({ error: `Order is already ${order.stage}` });

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      stage: "REJECTED",
      adminNote: parsed.data?.note,
      stageHistory: { create: { stage: "REJECTED", note: parsed.data?.note } },
    },
  });
  res.json({ order: updated });
});

// ---- Advance to the next stage in sequence (PAID -> BOUGHT -> ... -> DELIVERED) ----
router.post("/orders/:id/advance", async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order) return res.status(404).json({ error: "Order not found" });

  const idx = STAGE_ORDER.indexOf(order.stage);
  if (idx === -1 || idx === STAGE_ORDER.length - 1) {
    return res.status(400).json({ error: `Cannot advance from ${order.stage}` });
  }
  const updated = await advanceTo(order.id, STAGE_ORDER[idx + 1]);
  res.json({ order: updated });
});

async function advanceTo(orderId, stage) {
  return prisma.order.update({
    where: { id: orderId },
    data: { stage, stageHistory: { create: { stage } } },
  });
}

// ---- Exchange rate history ----
router.get("/rates", async (req, res) => {
  const rates = await prisma.exchangeRate.findMany({ orderBy: { setAt: "desc" }, take: 50 });
  res.json({ rates });
});

const addRateSchema = z.object({ rateDZD: z.number().positive() });
router.post("/rates", async (req, res) => {
  const parsed = addRateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const rate = await prisma.exchangeRate.create({ data: { rateDZD: parsed.data.rateDZD } });
  res.status(201).json({ rate });
});

// ---- Fee percentage ----
router.get("/settings", async (req, res) => {
  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  res.json({ settings });
});

const settingsSchema = z.object({
  feePercent: z.number().min(0).max(100).optional(),
  shippingDZD: z.number().nonnegative().optional(),
});
router.patch("/settings", async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: parsed.data,
    create: { id: 1, ...parsed.data },
  });
  res.json({ settings });
});

module.exports = router;
