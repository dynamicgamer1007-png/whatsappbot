// bot.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fetch = require('node-fetch'); // CommonJS

// Gemini API key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY is required!');
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

// ---------------- QR Event ----------------
client.on('qr', qr => {
  console.log('📱 QR GENERATED:');
  qrcode.generate(qr, { small: true });
  qrString = qr;
});

// ---------------- Ready ----------------
client.on('ready', () => {
  console.log('✅ WhatsApp Bot is Ready!');
  isReady = true;
});

// ---------------- Auth ----------------
client.on('authenticated', () => console.log('✅ Authenticated!'));
client.on('auth_failure', msg => console.error('❌ Auth failure:', msg));

client.on('disconnected', reason => {
  console.log('📌 Disconnected:', reason);
  isReady = false;
  setTimeout(() => {
    console.log('🔄 Reconnecting...');
    client.initialize();
  }, 5000);
});

// ---------------- Message Handler ----------------
client.on('message', async msg => {
  if (msg.fromMe || msg.from === 'status@broadcast') return;
  console.log(`🔥 MESSAGE: "${msg.body}" FROM: ${msg.from}`);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `You are a sarcastic Indian Gen Z bot replying to: ${msg.body}` }]
          }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 150 },
          safetySettings: [{ category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }]
        })
      }
    );

    if (!response.ok) throw new Error(`Gemini API ${response.status}`);

    const data = await response.json();
    let reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 
                'Bhai technical issues chal rahe hain... thoda wait karo 😅';

    if (reply.length > 1000) reply = reply.substring(0, 997) + '...';

    console.log(`🤖 AI REPLY: ${reply}`);
    await msg.reply(reply);
  } catch (err) {
    console.error('❌ ERROR:', err.message);
    const errors = [
      'Server hang ho gaya... 😩',
      'Error aa gaya bhai 💀',
      'Technical difficulties 🤡',
      'API crash Monday blues 📉'
    ];
    try { await msg.reply(errors[Math.floor(Math.random()*errors.length)]); } catch {}
  }
});

// ---------------- Express Routes ----------------
app.get('/', (req, res) => {
  if (qrString && !isReady) {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WhatsApp Bot - Scan QR</title>
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
        <style>
          body { font-family: Arial; text-align:center; padding:50px; background:#0a0a0a; color:white; }
          .container { max-width:500px; margin:0 auto; padding:30px; border-radius:10px; background:#1a1a1a; }
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
          QRCode.toCanvas(document.getElementById('qr-code'), '${qrString}', {
            width:300, margin:2, color:{dark:'#000', light:'#fff'}
          });
          setInterval(()=>{ location.reload(); },10000);
        </script>
      </body>
      </html>
    `);
  } else if (isReady) {
    res.json({ status:'✅ Bot connected!', ready:isReady, uptime:process.uptime(), timestamp:new Date().toISOString() });
  } else {
    res.json({ status:'Bot starting...', ready:isReady, uptime:process.uptime(), timestamp:new Date().toISOString() });
  }
});

app.get('/health', (req, res) => {
  res.json({ status:'healthy', whatsapp:isReady?'connected':'connecting', memory:process.memoryUsage(), uptime:process.uptime() });
});

app.listen(PORT, () => console.log(`🌐 Server running on port ${PORT}`));

// ---------------- Graceful Shutdown ----------------
['SIGINT','SIGTERM'].forEach(sig=>{
  process.on(sig, async ()=>{
    console.log(`🛑 ${sig} received, shutting down...`);
    try { await client.destroy(); } catch(e){ console.error(e); }
    process.exit(0);
  });
});

process.on('uncaughtException', e => console.error('💥 Uncaught Exception:', e.message));
process.on('unhandledRejection', r => console.error('💥 Unhandled Rejection:', r));

console.log('🚀 Starting Desi Sarcastic WhatsApp Bot...');
client.initialize();
