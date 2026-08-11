const express = require("express");
const multer = require("multer");
const path = require("path");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { generateReference } = require("../lib/reference");

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, "../../uploads"),
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
});

// ---- Create order (mirrors the "Estimate" screen in the prototype) ----
const createOrderSchema = z.object({
  productUrl: z.string().url(),
  productTitle: z.string().min(1),
  productSource: z.string().min(1), // "AliExpress" | "Temu" | ...
  priceUSD: z.number().positive(),
  shippingDZD: z.number().nonnegative().optional(),
  recipientName: z.string().min(2).optional(),
  address: z.string().min(3).optional(),
  wilaya: z.string().min(2).optional(),
  postalCode: z.string().min(3).optional(),
});

router.post("/", requireAuth, async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { productUrl, productTitle, productSource, priceUSD, shippingDZD } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });

  // Delivery info can come from this request, or fall back to what the
  // buyer already saved on their profile — either way it's required
  // before an order can be created, since we can't ship without it.
  const recipientName = parsed.data.recipientName || user?.name;
  const address = parsed.data.address || user?.address;
  const wilaya = parsed.data.wilaya || user?.wilaya;
  const postalCode = parsed.data.postalCode || user?.postalCode;
  if (!recipientName || !address || !wilaya || !postalCode) {
    return res.status(400).json({
      error: "Missing delivery info: full name, address, wilaya, and postal code are required",
    });
  }

  const [rate, settings] = await Promise.all([
    prisma.exchangeRate.findFirst({ orderBy: { setAt: "desc" } }),
    prisma.settings.findUnique({ where: { id: 1 } }),
  ]);
  if (!rate) return res.status(500).json({ error: "No exchange rate configured yet" });

  const feePercent = settings?.feePercent ?? 15;
  const shipping = shippingDZD ?? settings?.shippingDZD ?? 1400;
  const productDZD = round2(priceUSD * rate.rateDZD);
  const feeDZD = round2(productDZD * (feePercent / 100));
  const totalDZD = round2(productDZD + feeDZD + shipping);

  // Reference codes must be unique; retry on the rare collision.
  let reference;
  for (let i = 0; i < 5; i++) {
    const candidate = generateReference();
    const exists = await prisma.order.findUnique({ where: { reference: candidate } });
    if (!exists) {
      reference = candidate;
      break;
    }
  }
  if (!reference) return res.status(500).json({ error: "Could not generate reference, try again" });

  const order = await prisma.order.create({
    data: {
      reference,
      buyerId: req.user.id,
      productUrl,
      productTitle,
      productSource,
      priceUSD,
      recipientName,
      address,
      wilaya,
      postalCode,
      exchangeRateId: rate.id,
      feePercent,
      shippingDZD: shipping,
      productDZD,
      feeDZD,
      totalDZD,
      stage: "PENDING",
      stageHistory: { create: { stage: "PENDING" } },
    },
  });

  res.status(201).json({ order, baridimobNumber: process.env.BARIDIMOB_NUMBER });
});

// ---- Upload payment proof screenshot ----
router.post("/:id/proof", requireAuth, upload.single("proof"), async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order || order.buyerId !== req.user.id) return res.status(404).json({ error: "Order not found" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { paymentProofUrl: `/uploads/${req.file.filename}` },
  });
  res.json({ order: updated });
});

// ---- Buyer's own orders ----
router.get("/mine", requireAuth, async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { buyerId: req.user.id },
    orderBy: { createdAt: "desc" },
    include: { exchangeRate: true, stageHistory: { orderBy: { createdAt: "asc" } } },
  });
  res.json({ orders });
});

router.get("/:id", requireAuth, async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { exchangeRate: true, stageHistory: { orderBy: { createdAt: "asc" } } },
  });
  if (!order || order.buyerId !== req.user.id) return res.status(404).json({ error: "Order not found" });
  res.json({ order });
});

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = router;
