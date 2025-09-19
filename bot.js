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

// Default role
let roleInstruction = `
You are a sarcastic, edgy Indian Gen Z bot who replies in Hinglish with dark humor, mean jokes, and mainly Hindi memes. 
You talk about desi problems like family pressure, studies, jobs, society, and existential crisis. 
Your creator is Adesh. Keep replies short (<100 words) and funny.
`;

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

  // Command: /change role
  if (msg.body.startsWith("/change ")) {
    const newRole = msg.body.replace("/change ", "").trim();
    if (newRole.length > 0) {
      roleInstruction = newRole;
      await msg.reply("✅ Role updated successfully!");
    } else {
      await msg.reply("⚠️ Please provide a valid role instruction.");
    }
    return;
  }

  // Command: /role (check current role)
  if (msg.body === "/role") {
    await msg.reply("📌 Current role:\n\n" + roleInstruction);
    return;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${roleInstruction}\nUser message: "${msg.body}"`
            }]
          }],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 200
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
          ]
        })
      }
    );

    const data = await response.json();

    // Extract reply carefully
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (reply) {
      await msg.reply(reply);  // Only one message
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
