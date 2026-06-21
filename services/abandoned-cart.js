// services/abandoned-cart.js
const http = require('http');

const timers = new Map();

function formatPhone(phone) {
  return phone.replace(/\D/g, '').replace(/^0/, '62');
}

function sendWA(phone, message) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ phone, message });
    const req = http.request({
      host: 'localhost', port: 3001, path: '/send',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => { res.resume(); resolve(); });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

function schedule(leadData, settings) {
  const { name, phone, productName } = leadData;
  const fp = formatPhone(phone);

  if (timers.has(fp)) cancel(fp); // reset if already scheduled

  console.log(`[AbandonedCart] Scheduled WA reminder for ${fp} in 5 minutes`);

  const timer = setTimeout(async () => {
    timers.delete(fp);
    const store = settings.store_name || 'Digihack Store';
    const template = settings.wa_pending_lead_msg || 'Halo {name}! Kamu tadi sempat mau beli {product} di {store}. Yuk selesaikan pembelianmu sekarang sebelum kehabisan! 😊';
    const message = template
      .replace('{name}', name)
      .replace('{product}', productName)
      .replace('{store}', store);
    try {
      await sendWA(fp, message);
      console.log(`[AbandonedCart] WA sent to ${fp}`);
    } catch(e) {
      console.error(`[AbandonedCart] WA failed for ${fp}:`, e.message);
    }
  }, 5 * 60 * 1000);

  timers.set(fp, timer);
}

function cancel(phone) {
  const fp = formatPhone(phone);
  if (timers.has(fp)) {
    clearTimeout(timers.get(fp));
    timers.delete(fp);
    console.log(`[AbandonedCart] Cancelled reminder for ${fp}`);
  }
}

module.exports = { schedule, cancel };
