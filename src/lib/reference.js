// Generates the short human-readable code buyers put in the BaridiMob
// transfer note (e.g. JB-4512), and that admins match against incoming
// transfers. Not cryptographically meaningful — just needs to be short,
// easy to type/say over the phone, and unique.
function generateReference() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `JB-${n}${Math.floor(Math.random() * 10)}`;
}

module.exports = { generateReference };
