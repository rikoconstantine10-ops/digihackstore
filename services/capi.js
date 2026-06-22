const https = require("https");
const crypto = require("crypto");

function sendCapiEvent(pixelId, accessToken, events) {
  if (!pixelId || !accessToken) return;
  const body = JSON.stringify({ data: events, access_token: accessToken });
  const options = {
    hostname: "graph.facebook.com",
    path: "/v21.0/" + pixelId + "/events",
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
  };
  const req = https.request(options, (res) => {
    let d = "";
    res.on("data", chunk => d += chunk);
    res.on("end", () => console.log("[CAPI]", res.statusCode, d.slice(0, 300)));
  });
  req.on("error", e => console.error("[CAPI error]", e.message));
  req.write(body);
  req.end();
}

function hashSha256(val) {
  if (!val) return undefined;
  return crypto.createHash("sha256").update(val.trim().toLowerCase()).digest("hex");
}

function genEventId(prefix) {
  return prefix + "_" + Date.now() + "_" + crypto.randomBytes(4).toString("hex");
}

function capiPurchase(settings, order) {
  if (!settings.meta_pixel_id || !settings.meta_capi_token) return;
  const eventId = "purchase_" + order.ref_kode;
  sendCapiEvent(settings.meta_pixel_id, settings.meta_capi_token, [{
    event_name: "Purchase",
    event_id: eventId,
    event_time: Math.floor(Date.now() / 1000),
    action_source: "website",
    event_source_url: (settings.store_domain || "https://digihackstore.com") + "/order/status",
    user_data: {
      em: [hashSha256(order.customer_email)],
      ph: [hashSha256(order.customer_phone)],
    },
    custom_data: {
      currency: "IDR",
      value: order.amount,
      content_name: order.product_name,
      content_ids: [String(order.product_id)],
      content_type: "product",
      order_id: order.ref_kode
    }
  }]);
  return eventId;
}

function capiInitiateCheckout(settings, product, req, eventId) {
  if (!settings.meta_pixel_id || !settings.meta_capi_token) return;
  const evId = eventId || genEventId("ic");
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const ua = req.headers["user-agent"] || "";
  sendCapiEvent(settings.meta_pixel_id, settings.meta_capi_token, [{
    event_name: "InitiateCheckout",
    event_id: evId,
    event_time: Math.floor(Date.now() / 1000),
    action_source: "website",
    event_source_url: (settings.store_domain || "https://digihackstore.com") + "/checkout/" + product.slug,
    user_data: { client_ip_address: ip, client_user_agent: ua },
    custom_data: {
      currency: "IDR",
      value: product.discount_price || product.price,
      content_name: product.name,
      content_ids: [String(product.id)],
      content_type: "product",
      num_items: 1
    }
  }]);
  return evId;
}

function capiViewContent(settings, product, req, eventId) {
  if (!settings.meta_pixel_id || !settings.meta_capi_token) return;
  const evId = eventId || genEventId("vc");
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const ua = req.headers["user-agent"] || "";
  sendCapiEvent(settings.meta_pixel_id, settings.meta_capi_token, [{
    event_name: "ViewContent",
    event_id: evId,
    event_time: Math.floor(Date.now() / 1000),
    action_source: "website",
    event_source_url: (settings.store_domain || "https://digihackstore.com") + "/product/" + product.slug,
    user_data: { client_ip_address: ip, client_user_agent: ua },
    custom_data: {
      currency: "IDR",
      value: product.discount_price || product.price,
      content_name: product.name,
      content_ids: [String(product.id)],
      content_type: "product"
    }
  }]);
  return evId;
}

module.exports = { capiPurchase, capiInitiateCheckout, capiViewContent, genEventId };
