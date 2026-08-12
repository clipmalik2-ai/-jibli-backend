// Sends the admin a notification email whenever a new order comes in.
// Uses Resend (https://resend.com) via its plain REST API — no extra
// npm package needed since Node 18+ has fetch built in.
//
// Requires two env vars to actually send anything:
//   RESEND_API_KEY  - from your Resend dashboard
//   ADMIN_EMAIL     - where notifications should be sent
// If either is missing, this silently does nothing (so local dev
// without email configured still works fine).

async function sendAdminOrderEmail(order) {
  const apiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!apiKey || !adminEmail) return;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "Jibli <onboarding@resend.dev>",
        to: adminEmail,
        subject: `Nouvelle commande — ${order.reference}`,
        html: `
          <div style="font-family:sans-serif; max-width:480px;">
            <h2 style="margin-bottom:4px;">Nouvelle commande</h2>
            <p style="color:#888; margin-top:0;">${order.reference}</p>
            <p><strong>Produit :</strong> ${escapeHtml(order.productTitle)} (${escapeHtml(order.productSource)})</p>
            <p><strong>Total :</strong> ${Math.round(order.totalDZD).toLocaleString("fr-FR")} DA</p>
            <p><strong>Client :</strong> ${escapeHtml(order.recipientName)}</p>
            <p style="margin-top:20px;">Connecte-toi au tableau de bord admin pour confirmer le paiement.</p>
          </div>
        `,
      }),
    });
  } catch (err) {
    // Never let a failed notification break order creation.
    console.error("Failed to send admin notification email:", err.message);
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

module.exports = { sendAdminOrderEmail };
