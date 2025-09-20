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

// Handle messages
client.on("message", async (msg) => {
  console.log(`🔥 MESSAGE: "${msg.body}" FROM: ${msg.from}`);
  if (msg.fromMe || msg.from === "status@broadcast") return;

  // Commands
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

  // /say command
  if (msg.body.startsWith("/say")) {
    const text = msg.body.slice(5).trim();
    if (!text) {
      await msg.reply("❌ Usage: /say <text>");
      return;
    }
    try {
      const googleTTS = (await import("google-tts-api")).default;
      const url = googleTTS.getAudioUrl(text, { lang: "en", slow: false, host: "https://translate.google.com" });
      await msg.reply(url); // sends TTS URL
    } catch (err) {
      console.error("❌ TTS ERROR:", err.message);
      await msg.reply("⚠️ TTS failed");
    }
    return;
  }

  // /spam command
  if (msg.body.startsWith("/spam")) {
    const chat = await msg.getChat();
    if (!chat.isGroup) {
      await msg.reply("❌ /spam works only in groups!");
      return;
    }

    const parts = msg.body.split(" ");
    const count = parseInt(parts[1]);
    const spamMessage = parts.slice(2).join(" ");

    if (!count || !spamMessage) {
      await msg.reply("❌ Usage: /spam <count> <message>");
      return;
    }

    if (count > 500) {
      await msg.reply("⚠️ Max 10 messages at a time to stay safe!");
      return;
    }

    for (let i = 0; i < count; i++) {
      await chat.sendMessage(spamMessage);
      await new Promise((r) => setTimeout(r, 500));
    }

    console.log(`✅ Spammed ${count} messages in group ${chat.name}`);
    return;
  }

  // If bot is OFF, ignore other messages
  if (!botActive) return;

  // AI reply using Gemini
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
                  text: `You are a professional, polite, and respectful AI bot. Your creator is Adesh. Keep replies concise (<100 words). User message: "${msg.body}"`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
          safetySettings: [{ category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }],
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
