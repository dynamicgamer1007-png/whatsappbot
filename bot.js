import fetch from "node-fetch";
import qrcode from "qrcode-terminal";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;

// Gemini API key (stored in GitHub Secrets)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function askGemini(prompt) {
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent?key=" + GEMINI_API_KEY,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      }),
    }
  );

  const data = await response.json();
  return (
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    "⚠️ Sorry, I couldn't get a response."
  );
}

// WhatsApp Client
const client = new Client({
  authStrategy: new LocalAuth(),
});

client.on("qr", qr => {
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("✅ WhatsApp Bot is ready!");
});

client.on("message", async msg => {
  console.log(`🔥 MESSAGE: "${msg.body}" FROM: ${msg.from}`);
  try {
    const reply = await askGemini(msg.body);
    await msg.reply(reply);
  } catch (err) {
    console.error("❌ ERROR:", err.message);
    await msg.reply("⚠️ Something went wrong with Gemini.");
  }
});

client.initialize();
