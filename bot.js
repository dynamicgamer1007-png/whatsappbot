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
      "--disable-gpu",
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

// Bot toggle
let botActive = true;

// Group-specific banned users
let bannedUsers = {}; // { chatId: [userIds...] }

// Dynamic role (default polite)
let botRole =
  "You are a professional, polite, and respectful AI bot. Keep replies concise (<100 words).";

// Handle messages
client.on("message", async (msg) => {
  console.log(`🔥 MESSAGE: "${msg.body}" FROM: ${msg.from}`);
  if (msg.fromMe || msg.from === "status@broadcast") return;

  const chat = await msg.getChat();
  const chatId = chat.id._serialized;
  const senderId = msg.author || msg.from;

  // 🔹 Commands
  if (msg.body.startsWith("/off")) {
    botActive = false;
    await msg.reply("⚠️ Bot is now OFF");
    return;
  }
  if (msg.body.startsWith("/on")) {
    botActive = true;
    await msg.reply("✅ Bot is now ON");
    return;
  }

  // Skip messages from banned users
  if (bannedUsers[chatId]?.includes(senderId)) {
    console.log(`🚫 Ignored message from banned user: ${senderId}`);
    return;
  }

  // 🔹 /role command
  if (msg.body.startsWith("/role")) {
    const newRole = msg.body.slice(6).trim();
    if (!newRole) {
      await msg.reply("❌ Usage: /role <new role>");
      return;
    }
    botRole = `You are now acting as: ${newRole}. Keep replies under 100 words.`;
    await msg.reply(`✅ Role updated! Now: *${newRole}*`);
    return;
  }

  // 🔹 /dm command
  if (msg.body.startsWith("/dm")) {
    const parts = msg.body.split(" ");
    const number = parts[1];
    const message = parts.slice(2).join(" ");

    if (!number || !message) {
      await msg.reply("❌ Usage: /dm <number> <message>");
      return;
    }

    try {
      const formattedNumber = number.includes("@c.us")
        ? number
        : `${number.replace(/[^0-9]/g, "")}@c.us`;

      await client.sendMessage(formattedNumber, message);
      await msg.reply(`📩 Sent DM to ${number}: "${message}"`);
      console.log(`✅ DM sent to ${number}: ${message}`);
    } catch (err) {
      console.error("❌ DM ERROR:", err.message);
      await msg.reply("⚠️ Failed to send DM.");
    }
    return;
  }

  // 🔹 If bot is OFF, ignore other messages
  if (!botActive) return;

  // 🔹 AI reply using Gemini
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${botRole}\n\nUser message: "${msg.body}"`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
        }),
      }
    );

    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (reply) {
      await msg.reply(reply);
      console.log(`✅ Replied: ${reply}`);
    } else {
      await msg.reply("⚠️ Gemini API returned no content");
    }
  } catch (err) {
    console.error("❌ ERROR:", err.message);
    await msg.reply("⚠️ Bot error. Try again later.");
  }
});

// Initialize WhatsApp bot
client.initialize();
