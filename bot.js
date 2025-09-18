import qrcode from "qrcode-terminal";
import pkg from "whatsapp-web.js";
import fetch from "node-fetch";

const { Client, LocalAuth } = pkg;

// Gemini API key from GitHub Secrets
const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_KEY) {
  console.error("❌ ERROR: GEMINI_API_KEY not set!");
  process.exit(1);
}

// WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu"
    ],
  },
});

// Show QR in terminal
client.on("qr", (qr) => {
  console.log("📱 Scan this QR code to connect WhatsApp:");
  qrcode.generate(qr, { small: true });
});

// Bot ready
client.on("ready", () => {
  console.log("✅ WhatsApp Bot is ready!");
});

// Handle messages
client.on("message", async (msg) => {
  console.log(`🔥 MESSAGE: "${msg.body}" FROM: ${msg.from}`);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: msg.body }] }],
          generationConfig: { maxOutputTokens: 150, temperature: 0.8 },
        }),
      }
    );

    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (reply) {
      await msg.reply(reply);
      console.log(`✅ Replied: ${reply}`);
    } else {
      await msg.reply("⚠️ Gemini API returned no response.");
      console.error("❌ No content in Gemini API response:", data);
    }
  } catch (err) {
    console.error("❌ ERROR:", err.message);
    await msg.reply("⚠️ Bot error. Try again later.");
  }
});

// Initialize WhatsApp bot
client.initialize();
