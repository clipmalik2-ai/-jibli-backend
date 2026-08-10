const express = require("express");
const prisma = require("../lib/prisma");

const router = express.Router();

// ---- Current pricing, no login required ----
// Powers the website's live estimator. Buyers/visitors need this before
// they have an account, so it's intentionally not behind requireAuth.
router.get("/pricing", async (req, res) => {
  const [rate, settings] = await Promise.all([
    prisma.exchangeRate.findFirst({ orderBy: { setAt: "desc" } }),
    prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
  ]);
  if (!rate) return res.status(500).json({ error: "No exchange rate configured yet" });

  res.json({
    rateDZD: rate.rateDZD,
    feePercent: settings.feePercent,
    shippingDZD: settings.shippingDZD,
  });
});

// ---- Track an order by its reference code, no login required ----
// Only returns what a buyer needs to see progress — never phone number,
// payment proof, or other buyers' data. This is what the website's
// "Track my order" box calls.
router.get("/track/:reference", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { reference: req.params.reference.toUpperCase() },
    include: { stageHistory: { orderBy: { createdAt: "asc" } } },
  });
  if (!order) return res.status(404).json({ error: "No order found with this reference" });

  res.json({
    reference: order.reference,
    productTitle: order.productTitle,
    productSource: order.productSource,
    totalDZD: order.totalDZD,
    stage: order.stage,
    createdAt: order.createdAt,
    stageHistory: order.stageHistory.map((e) => ({ stage: e.stage, createdAt: e.createdAt })),
  });
});

module.exports = router;
