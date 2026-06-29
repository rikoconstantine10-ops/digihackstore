
const nodemailer = require('nodemailer');
const https = require('https');
const path = require('path');
const fs = require('fs');

function sendViaResend(apiKey, { from, to, subject, html }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ from, to: [to], subject, html });
    const req = https.request({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(d));
        else reject(new Error('Resend ' + res.statusCode + ': ' + d));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.sumopod.com',
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendProductEmail(order, product, addonProduct = null, bundleProducts = []) {
  const storeName = process.env.STORE_NAME || 'Digihack Store';
  const filePath = path.join(__dirname, '../public/uploads', product.file_path || '');
  const fileExists = product.file_path && fs.existsSync(filePath);

  const addonFilePath = addonProduct ? path.join(__dirname, '../public/uploads', addonProduct.file_path || '') : null;
  const addonFileExists = addonProduct && addonProduct.file_path && fs.existsSync(addonFilePath);

  const bundleSection = bundleProducts.length ? bundleProducts.map(bp => {
    const bpLink = bp.product_link || (bp.file_path ? '${bp.file_path}' : '');
    return `<div class='product-card' style='border-color:#e0e7ff;background:#f5f3ff;margin-top:10px'>
      <h3 style='margin:0 0 6px;color:#4c1d95;font-size:0.95rem'>📦 ${bp.name}</h3>
      ${bp.product_link ? `<p><a href='${bp.product_link}' style='color:#667eea;font-weight:600'>⬇️ Download ${bp.name}</a></p>` : bp.file_path ? `<p>📂 File terlampir.</p>` : ''}
    </div>`;
  }).join('') : '';

  const addonSection = addonProduct ? `
    <div class='product-card' style='border-color:#d1fae5;background:#f0fdf4;margin-top:10px'>
      <h3 style='margin:0 0 10px;color:#065f46'>🎁 Add-on: ${addonProduct.name}</h3>
      ${addonFileExists ? '<p>📂 File add-on terlampir di email ini.</p>' : addonProduct.file_path ? `<p>🔗 Link download add-on: <a href='${addonProduct.file_path}'>Klik di sini</a></p>` : ''}
    </div>` : '';

  let downloadSection = '';
  if (product.product_link) {
    downloadSection = `
    <div style='text-align:center;margin:28px 0'>
      <a href='${product.product_link}' style='display:inline-block;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:16px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:1.1rem;letter-spacing:.3px'>
        ⬇️ Download Produk Sekarang
      </a>
      <p style='margin:10px 0 0;font-size:0.82rem;color:#888'>Atau copy link ini: <a href='${product.product_link}' style='color:#667eea'>${product.product_link}</a></p>
    </div>`;
  } else if (fileExists) {
    downloadSection = `<p style='margin:16px 0'>📂 File produk terlampir di email ini. Silakan download.</p>`;
  } else if (product.file_path) {
    downloadSection = `<p style='margin:16px 0'>🔗 Link download: <a href='${product.file_path}' style='color:#667eea'>Klik di sini</a></p>`;
  }

  const html = `
  <!DOCTYPE html>
  <html>
  <head><meta charset='utf-8'><style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 30px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white; }
    .header h1 { margin: 0; font-size: 24px; }
    .body { padding: 30px; }
    .product-card { background: #f8f9ff; border: 1px solid #e0e4ff; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .footer { background: #f8f8f8; padding: 20px; text-align: center; color: #888; font-size: 12px; border-top: 1px solid #eee; }
  </style></head>
  <body>
  <div class='container'>
    <div class='header'>
      <h1>✨ ${storeName}</h1>
      <p style='margin:5px 0 0'>Pembayaran Berhasil!</p>
    </div>
    <div class='body'>
      <p>Halo <strong>${order.customer_name}</strong>,</p>
      <p>Terima kasih telah berbelanja di <strong>${storeName}</strong>. Pembayaran kamu telah berhasil dikonfirmasi.</p>
      <div class='product-card'>
        <h3 style='margin:0 0 10px'>📦 Detail Pesanan</h3>
        <p><strong>Produk:</strong> ${order.product_name}</p>
        <p><strong>Order ID:</strong> ${order.ref_kode}</p>
        <p><strong>Total:</strong> Rp ${order.amount.toLocaleString('id-ID')}</p>
        <p><strong>Metode:</strong> ${order.payment_method}</p>
      </div>
      ${downloadSection}
      ${bundleSection}
      ${addonSection}
      <p>Jika ada pertanyaan, balas email ini atau hubungi kami.</p>
      <p>Salam,<br><strong>${storeName}</strong></p>
    </div>
    <div class='footer'>
      <p>&copy; 2026 ${storeName}. All rights reserved.</p>
      <p>Email ini dikirim otomatis, jangan balas jika tidak perlu.</p>
    </div>
  </div>
  </body></html>
  `;

  const mailOptions = {
    from: `${storeName} <hello@digihackstore.com>`,
    to: order.email || order.customer_email,
    subject: `🎁 Produk Kamu Sudah Siap - ${order.product_name} | ${storeName}`,
    html,
    attachments: [],
  };

  if (fileExists) {
    mailOptions.attachments.push({ filename: path.basename(filePath), path: filePath });
  }
  if (addonFileExists) {
    mailOptions.attachments.push({ filename: path.basename(addonFilePath), path: addonFilePath });
  }

  let resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    try {
      const db = require('../db/database');
      const row = db.prepare("SELECT value FROM settings WHERE key='resend_api_key'").get();
      if (row && row.value) resendKey = row.value;
    } catch(e) {}
  }
  if (resendKey && !mailOptions.attachments.length) {
    return sendViaResend(resendKey, {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
      html: mailOptions.html
    });
  }

  return transporter.sendMail(mailOptions);
}

module.exports = { sendProductEmail };