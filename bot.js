const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Environment variables for deployment
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyD3E9g8uqvrIUhQHYueQXWx20Mcq52vRFY';

// Enhanced client for cloud deployment
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
      '--disable-web-security',
      '--single-process', // Important for cloud deployment
      '--no-sandbox'
    ]
  },
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
  }
});

let isReady = false;

client.on('qr', qr => {
  console.log('📱 QR CODE GENERATED - Scan this:');
  qrcode.generate(qr, { small: true });
  console.log('🔗 You can also scan using WhatsApp Web');
});

client.on('ready', () => {
  console.log('✅ WhatsApp Bot is Ready and Connected!');
  isReady = true;
});

client.on('authenticated', () => {
  console.log('✅ WhatsApp Authenticated Successfully!');
});

client.on('auth_failure', msg => {
  console.error('❌ Authentication Failed:', msg);
});

client.on('disconnected', (reason) => {
  console.log('🔌 Disconnected:', reason);
  isReady = false;
  
  // Auto-reconnect after 5 seconds
  setTimeout(() => {
    console.log('🔄 Attempting to reconnect...');
    client.initialize();
  }, 5000);
});

// Handle incoming messages with desi sarcastic personality
client.on('message', async msg => {
  // Skip own messages and status updates
  if (msg.fromMe || msg.from === 'status@broadcast') return;
  
  console.log(`📥 MESSAGE: "${msg.body}" FROM: ${msg.from}`);
  
  try {
    // Call Gemini API
    const fetch = (await import('node-fetch')).default;
    
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a sarcastic Indian Gen Z bot who speaks in Hindi memes and dark humor. You're perpetually tired, slightly dead inside, but hilariously witty. Use Hinglish (Hindi + English mix), popular Hindi memes, Indian cultural references, and find humor in desi problems and existential crisis. Be relatable to Indian Gen Z - talk about studies, family pressure, job market, etc. with dark sarcastic humor. Keep responses under 100 words. User message: ${msg.body}`
          }]
        }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 150
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      })
    });
    
    if (!geminiResponse.ok) {
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }
    
    const geminiData = await geminiResponse.json();
    
    if (geminiData.candidates && geminiData.candidates[0] && geminiData.candidates[0].content) {
      let aiReply = geminiData.candidates[0].content.parts[0].text.trim();
      
      // Ensure response isn't too long for WhatsApp
      if (aiReply.length > 1000) {
        aiReply = aiReply.substring(0, 997) + '...';
      }
      
      console.log(`🤖 AI REPLY: ${aiReply}`);
      
      // Send reply
      await msg.reply(aiReply);
      console.log('✅ REPLY SENT!');
      
    } else {
      console.log('❌ No valid AI response');
      await msg.reply('Bhai technical issues chal rahe hain... thoda wait karo 😅');
    }
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    
    // Sarcastic error message in Hindi
    const errorReplies = [
      'Yaar server hang ho gaya... IT wale ko call karna padega 😩',
      'Error aa gaya bhai... main bhi engineer hun, kya expect kiya tha? 💀',
      'Technical difficulties... matlab main bhi confused hun 🤡',
      'API crash ho gayi... Monday blues even for bots 📉'
    ];
    
    const randomReply = errorReplies[Math.floor(Math.random() * errorReplies.length)];
    
    try {
      await msg.reply(randomReply);
    } catch (sendError) {
      console.error('Failed to send error message:', sendError.message);
    }
  }
});

// Health check for deployment platforms
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ 
    status: 'Bot is running',
    ready: isReady,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    whatsapp: isReady ? 'connected' : 'connecting',
    memory: process.memoryUsage(),
    uptime: process.uptime()
  });
});

// Start HTTP server (required for some hosting platforms)
app.listen(PORT, () => {
  console.log(`🌐 Health server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  try {
    await client.destroy();
  } catch (error) {
    console.error('Error during shutdown:', error);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down...');
  try {
    await client.destroy();
  } catch (error) {
    console.error('Error during shutdown:', error);
  }
  process.exit(0);
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection:', reason);
});

// Start the bot
console.log('🚀 Starting Desi Sarcastic WhatsApp Bot...');
console.log('🔑 Using Gemini API key:', GEMINI_API_KEY ? 'Set' : 'Missing');

client.initialize();