
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.sumopod.com',
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendProductEmail(order, product) {
  const storeName = process.env.STORE_NAME || 'Digihack Store';
  const filePath = path.join(__dirname, '../public/uploads', product.file_path || '');
  const fileExists = product.file_path && fs.existsSync(filePath);

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
    .btn { display: inline-block; background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 12px 30px; border-radius: 25px; text-decoration: none; font-weight: bold; margin: 15px 0; }
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
      ${fileExists ? '<p>📂 File produk terlampir di email ini. Silakan download.</p>' : `<p>🔗 Link download produk: <a href='${product.file_path}'>Klik di sini</a></p>`}
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
  };

  if (fileExists) {
    mailOptions.attachments = [{
      filename: path.basename(filePath),
      path: filePath,
    }];
  }

  return transporter.sendMail(mailOptions);
}

module.exports = { sendProductEmail };