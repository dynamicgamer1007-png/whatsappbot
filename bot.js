import qrcode from "qrcode-terminal";
import pkg from "whatsapp-web.js";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

const { Client, LocalAuth, MessageMedia } = pkg;

// Gemini API key from GitHub Secrets or env
const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) {
  console.error("❌ ERROR: GEMINI_API_KEY not set!");
  process.exit(1);
}

// Bot state
let botActive = true;
let currentRole = `You are a professional, respectful AI bot who answers politely.`;

// Optional GIF & Sticker toggles
let gifMode = true;
let stickerMode = true;

// Sample Indian meme GIFs
const memes = [
  "https://media.giphy.com/media/3o6Zt481isNVuQI1l6/giphy.gif",
  "https://media.giphy.com/media/26BRv0ThflsHCqDrG/giphy.gif",
];

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

// QR Code
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

  if (msg.fromMe || msg.from === "status@broadcast") return;

  const body = msg.body.trim();

  // Commands
  if (body.startsWith("/off")) {
    botActive = false;
    await msg.reply("⚠️ Bot is now turned OFF.");
    return;
  }
  if (body.startsWith("/on")) {
    botActive = true;
    await msg.reply("✅ Bot is now turned ON.");
    return;
  }
  if (body.startsWith("/change ")) {
    currentRole = body.replace("/change ", "").trim();
    await msg.reply(`🎭 Bot role changed!`);
    return;
  }

  // TTS
  if (body.startsWith("/say ")) {
    if (!botActive) return;
    const text = body.replace("/say ", "").trim();
    try {
      const ttsResponse = await fetch(`https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=en&client=tw-ob`);
      const buffer = Buffer.from(await ttsResponse.arrayBuffer());
      const media = new MessageMedia("audio/mpeg", buffer.toString("base64"), "say.mp3");
      await msg.reply(media);
    } catch (err) {
      console.error("❌ TTS ERROR:", err.message);
      await msg.reply("⚠️ TTS failed.");
    }
    return;
  }

  // /sticker command
  if (stickerMode && body.startsWith("/sticker")) {
    try {
      let media;
      if (msg.hasMedia) {
        const attachment = await msg.downloadMedia();
        media = new MessageMedia(attachment.mimetype, attachment.data, "sticker");
      } else {
        const text = body.replace("/sticker", "").trim() || " ";
        const imgBuffer = fs.readFileSync(path.join("placeholder.png")); // optional: a small template
        media = new MessageMedia("image/png", imgBuffer.toString("base64"), "sticker");
      }
      await msg.reply(media);
      return;
    } catch (err) {
      console.error("❌ STICKER ERROR:", err.message);
      await msg.reply("⚠️ Failed to create sticker.");
      return;
    }
  }

  // /gif command
  if (gifMode && body.startsWith("/gif ")) {
    try {
      const query = body.replace("/gif ", "").trim();
      const gifUrl = memes[Math.floor(Math.random() * memes.length)]; // placeholder: random meme
      await msg.reply(gifUrl);
      return;
    } catch (err) {
      console.error("❌ GIF ERROR:", err.message);
      await msg.reply("⚠️ Failed to fetch GIF.");
      return;
    }
  }

  // Skip AI responses if bot is off
  if (!botActive) return;

  // Call Gemini API for AI response
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${currentRole} User message: "${body}"` }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 150 },
          safetySettings: [{ category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }]
        })
      }
    );
    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (reply) {
      await msg.reply(reply);
      console.log(`✅ Replied: ${reply}`);
    } else {
      console.error("❌ No content in Gemini API response", data);
      await msg.reply("⚠️ Gemini API no response.");
    }
  } catch (err) {
    console.error("❌ Gemini ERROR:", err.message);
    await msg.reply("⚠️ Bot error. Try again later.");
  }
});

// Initialize bot
client.initialize();
