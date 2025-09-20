import qrcode from "qrcode-terminal";
import pkg from "whatsapp-web.js";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import gTTS from "google-tts-api";

const { Client, LocalAuth, MessageMedia } = pkg;

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

// Generate Google TTS audio
async function generateTTS(text, lang = "en") {
  try {
    const url = gTTS.getAudioUrl(text, {
      lang: lang,
      slow: false,
      host: "https://translate.google.com",
    });

    const res = await fetch(url);
    if (!res.ok) throw new Error(`TTS failed with status ${res.status}`);

    const buffer = Buffer.from(await res.arrayBuffer());
    const fileName = `./temp_${Date.now()}.mp3`;
    fs.writeFileSync(fileName, buffer);
    return fileName;
  } catch (err) {
    console.error("❌ TTS ERROR:", err.message);
    return null;
  }
}

// Handle messages
client.on("message", async (msg) => {
  console.log(`🔥 MESSAGE: "${msg.body}" FROM: ${msg.from}`);

  // Skip own messages and status updates
  if (msg.fromMe || msg.from === "status@broadcast") return;

  try {
    // /say command triggers TTS
    if (msg.body.startsWith("/say ")) {
      const textToSay = msg.body.replace("/say ", "").trim();
      if (!textToSay) return;

      const audioFile = await generateTTS(textToSay, "en"); // "hi" for Hindi
      if (audioFile) {
        const media = MessageMedia.fromFilePath(audioFile);
        await msg.reply(media);
        fs.unlinkSync(audioFile); // delete temp file
        console.log("✅ Sent TTS voice note for /say command");
      }
      return;
    }

    // Otherwise, normal Gemini AI response
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `
You are a professional, respectful AI bot. Reply concisely and clearly.
User message: "${msg.body}"
              `
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 200
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
          ]
        })
      }
    );

    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (reply) {
      await msg.reply(reply);
      console.log(`✅ Replied: ${reply}`);
    } else {
      console.error("❌ Gemini returned no content", data);
      await msg.reply("Arre bhai, kuch technical gadbad ho gayi 😅");
    }

  } catch (err) {
    console.error("❌ ERROR:", err.message);
    await msg.reply("⚠️ Bot error. Try again later.");
  }
});

// Initialize WhatsApp bot
client.initialize();
