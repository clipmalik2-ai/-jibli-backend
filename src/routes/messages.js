const express = require("express");
const { z } = require("zod");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// A buyer only ever sees their own thread with the admin — there's no
// buyerId param here on purpose, it's always req.user.id.
router.get("/", requireAuth, async (req, res) => {
  const messages = await prisma.message.findMany({
    where: { buyerId: req.user.id },
    orderBy: { createdAt: "asc" },
  });
  res.json({ messages });
});

const sendSchema = z.object({ content: z.string().min(1).max(2000) });
router.post("/", requireAuth, async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const message = await prisma.message.create({
    data: { buyerId: req.user.id, senderRole: "BUYER", content: parsed.data.content },
  });
  res.status(201).json({ message });
});

module.exports = router;
