import qrcode from "qrcode-terminal";
import pkg from "whatsapp-web.js";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

const { Client, LocalAuth } = pkg;

// API Keys
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const SERPER_KEY = process.env.SERPER_API_KEY; // Get free key from serper.dev

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

// Lead generation storage
const LEADS_FILE = "leads.json";
let leads = [];

// Load existing leads
function loadLeads() {
  try {
    if (fs.existsSync(LEADS_FILE)) {
      leads = JSON.parse(fs.readFileSync(LEADS_FILE, "utf-8"));
      console.log(`📊 Loaded ${leads.length} existing leads`);
    }
  } catch (err) {
    console.error("⚠️ Error loading leads:", err.message);
    leads = [];
  }
}

// Save leads
function saveLeads() {
  try {
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
    console.log(`💾 Saved ${leads.length} leads`);
  } catch (err) {
    console.error("❌ Error saving leads:", err.message);
  }
}

// Search for businesses using Google (via Serper API)
async function searchBusinesses(query, location = "Allahabad") {
  if (!SERPER_KEY) {
    console.log("⚠️ SERPER_API_KEY not set. Skipping search.");
    return [];
  }

  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": SERPER_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: `${query} in ${location} contact number -website -app`,
        num: 10,
      }),
    });

    const data = await response.json();
    return data.organic || [];
  } catch (err) {
    console.error("❌ Search error:", err.message);
    return [];
  }
}

// Extract phone numbers from text
function extractPhoneNumbers(text) {
  const phoneRegex = /(\+91|0)?[\s-]?[6-9]\d{9}/g;
  const matches = text.match(phoneRegex);
  if (!matches) return [];
  
  return [...new Set(matches.map(num => num.replace(/[\s-]/g, "")))];
}

// Generate personalized pitch using Gemini
async function generatePitch(businessName, businessType) {
  try {
    const prompt = `You are a professional Flutter developer reaching out to local businesses.

Business Name: ${businessName}
Business Type: ${businessType}
Your Name: Adesh
Your Skills: Flutter Developer (Mobile Apps), Web Development

Write a short, personalized WhatsApp message (max 120 words) that:
1. Greets them warmly and mentions their business by name
2. Briefly explains how a mobile app/website could help their business grow
3. Mentions you're a local developer in Allahabad
4. Includes a soft call-to-action (not pushy)
5. Sounds genuine and conversational (not salesy)

Keep it professional but friendly. No emojis except one at the end.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 250 },
        }),
      }
    );

    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  } catch (err) {
    console.error("❌ Pitch generation error:", err.message);
    return null;
  }
}

// Lead generation command
async function generateLeads(businessType, location, msg) {
  await msg.reply(`🔍 Searching for ${businessType} in ${location}...`);

  const results = await searchBusinesses(businessType, location);
  
  if (results.length === 0) {
    await msg.reply("❌ No results found. Try different keywords.");
    return;
  }

  let newLeads = 0;

  for (const result of results) {
    const businessName = result.title;
    const snippet = result.snippet || "";
    const phones = extractPhoneNumbers(snippet);

    if (phones.length === 0) continue;

    // Check if lead already exists
    const existingLead = leads.find(
      l => l.name === businessName || phones.some(p => l.phones.includes(p))
    );
    
    if (existingLead) continue;

    // Generate personalized pitch
    const pitch = await generatePitch(businessName, businessType);
    if (!pitch) continue;

    const lead = {
      id: Date.now() + Math.random(),
      name: businessName,
      type: businessType,
      location: location,
      phones: phones,
      pitch: pitch,
      source: result.link || "N/A",
      addedAt: new Date().toISOString(),
      status: "pending", // pending, contacted, interested, rejected
    };

    leads.push(lead);
    newLeads++;

    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit
  }

  saveLeads();
  await msg.reply(
    `✅ Found ${newLeads} new leads!\n\n` +
    `Total leads: ${leads.length}\n` +
    `Use /viewleads to see them\n` +
    `Use /sendlead <id> to send a pitch`
  );
}

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

  // 🔹 /findleads command
  if (msg.body.startsWith("/findleads")) {
    const parts = msg.body.split(" ");
    const businessType = parts.slice(1, -1).join(" ") || "coaching centers";
    const location = parts[parts.length - 1] || "Allahabad";

    if (parts.length < 2) {
      await msg.reply(
        "❌ Usage: /findleads <business type> <location>\n\n" +
        "Examples:\n" +
        "• /findleads gyms Allahabad\n" +
        "• /findleads coaching centers Prayagraj\n" +
        "• /findleads cafes Allahabad"
      );
      return;
    }

    await generateLeads(businessType, location, msg);
    return;
  }

  // 🔹 /viewleads command
  if (msg.body.startsWith("/viewleads")) {
    if (leads.length === 0) {
      await msg.reply("📭 No leads yet. Use /findleads to generate some!");
      return;
    }

    const status = msg.body.split(" ")[1] || "pending";
    const filtered = leads.filter(l => l.status === status);

    if (filtered.length === 0) {
      await msg.reply(`📭 No ${status} leads found.`);
      return;
    }

    let response = `📊 *${status.toUpperCase()} LEADS (${filtered.length})*\n\n`;
    
    filtered.slice(0, 10).forEach((lead, idx) => {
      response += `*${idx + 1}. ${lead.name}*\n`;
      response += `   Type: ${lead.type}\n`;
      response += `   Phones: ${lead.phones.join(", ")}\n`;
      response += `   ID: ${lead.id}\n\n`;
    });

    if (filtered.length > 10) {
      response += `\n... and ${filtered.length - 10} more\n`;
    }

    response += `\n💡 Use /leadinfo <id> to see full details`;
    await msg.reply(response);
    return;
  }

  // 🔹 /leadinfo command
  if (msg.body.startsWith("/leadinfo")) {
    const leadId = parseFloat(msg.body.split(" ")[1]);
    const lead = leads.find(l => l.id === leadId);

    if (!lead) {
      await msg.reply("❌ Lead not found. Use /viewleads to see available leads.");
      return;
    }

    const response = 
      `📋 *LEAD DETAILS*\n\n` +
      `*Name:* ${lead.name}\n` +
      `*Type:* ${lead.type}\n` +
      `*Location:* ${lead.location}\n` +
      `*Phones:* ${lead.phones.join(", ")}\n` +
      `*Status:* ${lead.status}\n` +
      `*Added:* ${new Date(lead.addedAt).toLocaleDateString()}\n\n` +
      `*PERSONALIZED PITCH:*\n${lead.pitch}\n\n` +
      `💡 Use /sendlead ${lead.id} to send this pitch`;

    await msg.reply(response);
    return;
  }

  // 🔹 /sendlead command (sends pitch to lead)
  if (msg.body.startsWith("/sendlead")) {
    const leadId = parseFloat(msg.body.split(" ")[1]);
    const lead = leads.find(l => l.id === leadId);

    if (!lead) {
      await msg.reply("❌ Lead not found.");
      return;
    }

    if (lead.status === "contacted") {
      await msg.reply("⚠️ You've already contacted this lead. Still send? Reply /forcecontact " + leadId);
      return;
    }

    await msg.reply(`📤 Sending pitch to ${lead.name}...\n\nPhone: ${lead.phones[0]}`);

    try {
      const formattedNumber = lead.phones[0].replace(/[^0-9]/g, "");
      const whatsappNumber = formattedNumber.startsWith("91") 
        ? `${formattedNumber}@c.us`
        : `91${formattedNumber}@c.us`;

      await client.sendMessage(whatsappNumber, lead.pitch);
      
      // Update lead status
      lead.status = "contacted";
      lead.contactedAt = new Date().toISOString();
      saveLeads();

      await msg.reply(`✅ Pitch sent successfully!\n\nLead marked as "contacted"`);
      console.log(`✅ Pitch sent to ${lead.name} at ${whatsappNumber}`);
    } catch (err) {
      console.error("❌ Send error:", err.message);
      await msg.reply(`⚠️ Failed to send: ${err.message}`);
    }
    return;
  }

  // 🔹 /updatestatus command
  if (msg.body.startsWith("/updatestatus")) {
    const parts = msg.body.split(" ");
    const leadId = parseFloat(parts[1]);
    const newStatus = parts[2];

    const lead = leads.find(l => l.id === leadId);
    if (!lead) {
      await msg.reply("❌ Lead not found.");
      return;
    }

    const validStatuses = ["pending", "contacted", "interested", "rejected"];
    if (!validStatuses.includes(newStatus)) {
      await msg.reply(`❌ Invalid status. Use: ${validStatuses.join(", ")}`);
      return;
    }

    lead.status = newStatus;
    saveLeads();
    await msg.reply(`✅ Lead status updated to: ${newStatus}`);
    return;
  }

  // 🔹 /stats command
  if (msg.body.startsWith("/stats")) {
    const total = leads.length;
    const pending = leads.filter(l => l.status === "pending").length;
    const contacted = leads.filter(l => l.status === "contacted").length;
    const interested = leads.filter(l => l.status === "interested").length;
    const rejected = leads.filter(l => l.status === "rejected").length;

    const response = 
      `📊 *LEAD STATISTICS*\n\n` +
      `Total Leads: ${total}\n` +
      `├ Pending: ${pending}\n` +
      `├ Contacted: ${contacted}\n` +
      `├ Interested: ${interested}\n` +
      `└ Rejected: ${rejected}\n\n` +
      `Conversion Rate: ${total > 0 ? ((interested / contacted) * 100).toFixed(1) : 0}%`;

    await msg.reply(response);
    return;
  }

  // 🔹 /help command
  if (msg.body.startsWith("/help")) {
    const helpText = 
      `🤖 *BOT COMMANDS*\n\n` +
      `*Lead Generation:*\n` +
      `/findleads <type> <location> - Find leads\n` +
      `/viewleads [status] - View all leads\n` +
      `/leadinfo <id> - View lead details\n` +
      `/sendlead <id> - Send pitch to lead\n` +
      `/updatestatus <id> <status> - Update lead\n` +
      `/stats - View statistics\n\n` +
      `*Bot Control:*\n` +
      `/on - Turn bot ON\n` +
      `/off - Turn bot OFF\n` +
      `/role <role> - Change bot personality\n` +
      `/dm <number> <msg> - Send DM\n\n` +
      `*Examples:*\n` +
      `/findleads gyms Allahabad\n` +
      `/viewleads pending\n` +
      `/sendlead 1234567890`;

    await msg.reply(helpText);
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
      await msg.reply(`📩 Sent DM to ${number}`);
      console.log(`✅ DM sent to ${number}`);
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

// Load leads on startup
loadLeads();

// Initialize WhatsApp bot
client.initialize();
