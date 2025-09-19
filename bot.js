import qrcode from "qrcode-terminal";
import pkg from "whatsapp-web.js";
import fetch from "node-fetch";

const { Client, LocalAuth } = pkg;

// Gemini API key
const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_KEY) {
  console.error("❌ ERROR: GEMINI_API_KEY not set!");
  process.exit(1);
}

// Memory for context
const userMemory = new Map(); // { userId: [msg1, msg2, ...] }
const botActive = new Map();  // { chatId: true/false }

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

  // Skip own messages and status updates
  if (msg.fromMe || msg.from === "status@broadcast") return;

  const chatId = msg.from;

  // ON/OFF Commands
  if (msg.body.toLowerCase() === "/bot off") {
    botActive.set(chatId, false);
    await msg.reply("🤐 Okay, I’ll stay quiet here.");
    return;
  }
  if (msg.body.toLowerCase() === "/bot on") {
    botActive.set(chatId, true);
    await msg.reply("🔥 Bot is back online! What’s up?");
    return;
  }

  // If bot is OFF in this chat → ignore
  if (botActive.get(chatId) === false) return;

  // Save user message in memory
  if (!userMemory.has(chatId)) userMemory.set(chatId, []);
  const history = userMemory.get(chatId);
  history.push(`User: ${msg.body}`);
  if (history.length > 5) history.shift(); // keep only last 5
  userMemory.set(chatId, history);

  try {
    // Build context
    const contextText = history.join("\n");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `
You are a helpful, professional WhatsApp bot created by Adesh.
You always respect the user, keep responses clear and under 100 words.
Here is the recent conversation history for context:
${contextText}
Now reply to the latest user message: "${msg.body}"
              `
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 200
          }
        })
      }
    );

    const data = await response.json();

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (reply) {
      // Save bot reply to memory too
      history.push(`Bot: ${reply}`);
      if (history.length > 5) history.shift();
      userMemory.set(chatId, history);

      await msg.reply(reply);
      console.log(`✅ Replied: ${reply}`);
    } else {
      console.error("❌ Gemini returned no content", data);
      await msg.reply("⚠️ No response from AI, try again later.");
    }

  } catch (err) {
    console.error("❌ ERROR:", err.message);
    await msg.reply("⚠️ Bot error. Try again later.");
  }
});

// Initialize WhatsApp bot
client.initialize();
