// bot.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fetch = require('node-fetch'); // Fixed for CommonJS

// Environment variable for Gemini API
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY environment variable is required!');
  process.exit(1);
}

// Express server
const app = express();
const PORT = process.env.PORT || 3000;

// WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './whatsapp-session',
    clientId: 'client-one'
  }),
  puppeteer: {
    headless: true,
    executablePath: '/usr/bin/google-chrome', // Use system Chrome on Render
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--single-process',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--font-render-hinting=none'
    ]
  },
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
  }
});

let isReady = false;
let qrString = null;

// ---------------- QR EVENT ----------------
client.on('qr', qr => {
  console.log('📱 QR GENERATED:', qr);
  qrcode.generate(qr, { small: true });
  qrString = qr;
});

// ---------------- READY ----------------
client.on('ready', () => {
  console.log('✅ WhatsApp Bot is Ready and Connected!');
  isReady = true;
});

// ---------------- AUTH ----------------
client.on('authenticated', () => {
  console.log('✅ WhatsApp Authenticated Successfully!');
});

client.on('auth_failure', msg => {
  console.error('❌ Authentication Failed:', msg);
});

client.on('disconnected', reason => {
  console.log('📌 Disconnected:', reason);
  isReady = false;
  setTimeout(() => {
    console.log('🔄 Attempting to reconnect...');
    client.initialize();
  }, 5000);
});

// ---------------- MESSAGE HANDLER ----------------
client.on('message', async msg => {
  if (msg.fromMe || msg.from === 'status@broadcast') return;
  console.log(`🔥 MESSAGE: "${msg.body}" FROM: ${msg.from}`);

  try {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, 
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a sarcastic Indian Gen Z bot speaking Hinglish, memes, and dark humor. Reply to: ${msg.body}`
            }]
          }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 150 },
          safetySettings: [{ category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }]
        })
      }
    );

    if (!geminiResponse.ok) {
      const errBody = await geminiResponse.text();
      throw new Error(`Gemini API error ${geminiResponse.status}: ${errBody}`);
    }

    const geminiData = await geminiResponse.json();
    let aiReply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!aiReply) {
      aiReply = 'Bhai technical issues chal rahe hain... thoda wait karo 😅';
    } else if (aiReply.length > 1000) {
      aiReply = aiReply.substring(0, 997) + '...';
    }

    console.log(`🤖 AI REPLY: ${aiReply}`);
    await msg.reply(aiReply);
    console.log('✅ REPLY SENT!');
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    const errorReplies = [
      'Yaar server hang ho gaya... IT wale ko call karna padega 😩',
      'Error aa gaya bhai... main bhi engineer hun, kya expect kiya tha? 💀',
      'Technical difficulties... matlab main bhi confused hun 🤡',
      'API crash ho gayi... Monday blues even for bots 📉'
    ];
    const randomReply = errorReplies[Math.floor(Math.random() * errorReplies.length)];
    try { await msg.reply(randomReply); } catch { }
  }
});

// ---------------- EXPRESS WEB ENDPOINT ----------------
app.get('/', (req, res) => {
  if (qrString && !isReady) {
    // Show QR code
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WhatsApp Bot - Scan QR</title>
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
        <style>
          body { font-family: Arial; text-align: center; padding: 50px; background:#0a0a0a; color:white; }
          .container { max-width: 500px; margin:0 auto; padding:30px; border-radius:10px; background:#1a1a1a;}
          #qr-code { margin:20px 0; }
          .status { font-size:18px; color:#25D366; margin:20px 0; }
          .instructions { color:#888; margin:20px 0; line-height:1.5; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🤖 Desi Sarcastic WhatsApp Bot</h1>
          <div class="status">📱 Scan QR Code to Connect</div>
          <canvas id="qr-code"></canvas>
          <div class="instructions">
            <p>1. Open WhatsApp → Settings → Linked Devices</p>
            <p>2. Tap "Link a Device"</p>
            <p>3. Scan this QR code</p>
          </div>
        </div>
        <script>
          QRCode.toCanvas(document.getElementById('qr-code'), '${qrString}', { width: 300, margin:2, color:{dark:'#000000',light:'#FFFFFF'} });
          setInterval(()=>{ location.reload(); },10000);
        </script>
      </body>
      </html>
    `);
  } else if (isReady) {
    res.json({ status: '✅ Bot is connected!', ready: isReady, uptime: process.uptime(), timestamp: new Date().toISOString() });
  } else {
    res.json({ status: 'Bot starting...', ready: isReady, uptime: process.uptime(), timestamp: new Date().toISOString() });
  }
});

app.get('/health', (req, res) => {
  res.json({ status:'healthy', whatsapp:isReady?'connected':'connecting', memory: process.memoryUsage(), uptime: process.uptime() });
});

app.listen(PORT, () => console.log(`🌐 Health server running on port ${PORT}`));

// ---------------- GRACEFUL SHUTDOWN ----------------
['SIGINT','SIGTERM'].forEach(signal=>{
  process.on(signal, async ()=>{
    console.log(`🛑 ${signal} received, shutting down...`);
    try { await client.destroy(); } catch(e){ console.error(e); }
    process.exit(0);
  });
});

process.on('uncaughtException', e => console.error('💥 Uncaught Exception:', e.message));
process.on('unhandledRejection', (r)=>console.error('💥 Unhandled Rejection:', r));

console.log('🚀 Starting Desi Sarcastic WhatsApp Bot...');
client.initialize();
