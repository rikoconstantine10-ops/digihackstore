const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const app = express();
app.use(express.json());

let sock = null;
let isConnected = false;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('\n[WA] Scan QR code ini dengan WhatsApp kamu:');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'close') {
      isConnected = false;
      const shouldReconnect = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
        : true;
      console.log('[WA] Disconnected:', lastDisconnect?.error?.message);
      if (shouldReconnect) {
        console.log('[WA] Reconnecting in 3s...');
        setTimeout(connectToWhatsApp, 3000);
      } else {
        console.log('[WA] Logged out. Hapus folder auth_info_baileys dan restart.');
      }
    } else if (connection === 'open') {
      isConnected = true;
      console.log('[WA] Connected!');
    }
  });
}

app.post('/send', async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ success: false, error: 'phone and message required' });
  if (!isConnected || !sock) return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
  try {
    const jid = phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    await sock.sendMessage(jid, { text: message });
    console.log(`[WA] Sent to ${phone}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[WA] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/status', (req, res) => {
  res.json({ connected: isConnected, timestamp: new Date().toISOString() });
});

app.listen(3001, () => {
  console.log('[WA] Service running on port 3001');
  connectToWhatsApp();
});