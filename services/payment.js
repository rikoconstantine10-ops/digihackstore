
const crypto = require('crypto');
const https = require('https');
const qs = require('querystring');
const { URL } = require('url');

const API_KEY = process.env.VMP_API_KEY;
const SECRET_KEY = process.env.VMP_SECRET_KEY;
const BASE_URL = process.env.VMP_BASE_URL || 'https://violetmediapay.com/api/live';

function makeSignature(refKode, amount) {
  return crypto.createHmac('sha256', SECRET_KEY).update(`${refKode}${API_KEY}${amount}`).digest('hex');
}

function postRequest(endpoint, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}/${endpoint}`);
    const postData = qs.stringify(data);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function createTransaction({ refKode, amount, channel, cusName, cusEmail, cusPhone, produk }) {
  const expiredTime = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
  const signature = makeSignature(refKode, amount);
  return postRequest('create', {
    api_key: API_KEY,
    secret_key: SECRET_KEY,
    channel_payment: channel,
    ref_kode: refKode,
    nominal: amount,
    cus_nama: cusName,
    cus_email: cusEmail,
    cus_phone: cusPhone,
    produk,
    url_redirect: process.env.REDIRECT_URL,
    url_callback: process.env.CALLBACK_URL,
    expired_time: expiredTime,
    signature,
  });
}

async function getChannels() {
  return postRequest('channel-payment', { api_key: API_KEY, secret_key: SECRET_KEY, channel_payment: 'list' });
}

function verifyCallbackSignature(refId, signatureReceived) {
  const expected = crypto.createHmac('sha256', API_KEY).update(String(refId)).digest('hex');
  return expected === signatureReceived;
}

module.exports = { createTransaction, getChannels, verifyCallbackSignature };
