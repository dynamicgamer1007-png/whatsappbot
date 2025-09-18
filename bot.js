// bot.js
import qrcode from "qrcode-terminal";
import { Client, LocalAuth } from "whatsapp-web.js";

// ✅ Ensure fetch works everywhere (Node <18 fallback)
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// =========================
// Gemini API Helper
// =========================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // store in GitHub secrets!
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent";

async function askGemini(prompt) {
  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    const data = await res.json();
    return (
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "⚠️ Gemini gave no response."
    );
  } catch (err) {
    console.error("❌ Gemini API error:", err.message || err);
    return "⚠️ Error contacting Gemini API.";
  }
}

// =========================
// Initialize WhatsApp Client
// =========================
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

// =========================
// QR & Status Handlers
// =========================
client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("📲 Scan the QR code above with WhatsApp Web.");
});

client.on("authenticated", () => {
  console.log("🔑 Authenticated successfully!");
});

client.on("auth_failure", (msg) => {
  console.error("❌ Authentication failed:", msg);
});

client.on("ready", () => {
  console.log("✅ WhatsApp bot is ready and running!");
});

// =========================
// Message Handler
// =========================
client.on("message", async (msg) => {
  try {
    console.log(`🔥 MESSAGE: "${msg.body}" FROM: ${msg.from}`);

    const text = msg.body.trim();

    // Basic test
    if (text.toLowerCase() === "hi") {
      await msg.reply("👋 Hey! Send me a question and I’ll ask Gemini ✨");
      return;
    }

    // Forward any other message to Gemini
    const reply = await askGemini(text);
    await msg.reply(reply);

  } catch (err) {
    console.error("❌ ERROR in message handler:", err.message || err);
  }
});

// =========================
// Start the bot
// =========================
client.initialize();

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received, shutting down...");
  client.destroy();
});
