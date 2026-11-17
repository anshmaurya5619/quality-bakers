const encoder = new TextEncoder();
let cachedGoogleKeys = null;
let cachedServiceToken = null;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers }
  });
}
function b64urlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
function decodePart(value) {
  return JSON.parse(new TextDecoder().decode(b64urlDecode(value)));
}
function pemToBytes(pem) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  return b64urlDecode(body.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
}
async function importPrivateKey(pem) {
  return crypto.subtle.importKey("pkcs8", pemToBytes(pem), {
    name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"
  }, false, ["sign"]);
}
async function signJwt(claims, privateKey) {
  const head = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const body = btoa(JSON.stringify(claims))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const input = head + "." + body;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, encoder.encode(input));
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return input + "." + sig;
}
async function googleKeys() {
  if (cachedGoogleKeys && cachedGoogleKeys.expires > Date.now()) return cachedGoogleKeys.keys;
  const response = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  if (!response.ok) throw new Error("Firebase token verification keys unavailable");
  const data = await response.json();
  cachedGoogleKeys = { keys: data.keys, expires: Date.now() + 45 * 60 * 1000 };
  return data.keys;
}
async function verifyFirebaseIdToken(token, projectId) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid Firebase sign-in token");
  const header = decodePart(parts[0]), claims = decodePart(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported sign-in token");
  const jwk = (await googleKeys()).find(k => k.kid === header.kid);
  if (!jwk) throw new Error("Firebase sign-in token key is not recognized");
  const key = await crypto.subtle.importKey("jwk", jwk, {
    name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"
  }, false, ["verify"]);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", key, b64urlDecode(parts[2]), encoder.encode(parts[0] + "." + parts[1])
  );
  const now = Math.floor(Date.now() / 1000);
  if (!valid || claims.aud !== projectId
    || claims.iss !== "https://securetoken.google.com/" + projectId
    || typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 128
    || !Number.isFinite(claims.exp) || claims.exp <= now
    || !Number.isFinite(claims.iat) || claims.iat > now + 300
    || !Number.isFinite(claims.auth_time) || claims.auth_time > now + 300) {
    throw new Error("Firebase sign-in token is invalid or expired");
  }
  return claims;
}
async function serviceAccessToken(env) {
  if (cachedServiceToken && cachedServiceToken.expires > Date.now() + 60000) return cachedServiceToken.token;
  if (!env.FIREBASE_SERVICE_ACCOUNT_EMAIL || !env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw new Error("Server service-account secrets are not configured");
  }
  const now = Math.floor(Date.now() / 1000);
  const key = await importPrivateKey(env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n"));
  const assertion = await signJwt({
    iss: env.FIREBASE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600
  }, key);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error("Could not obtain Firestore service access");
  cachedServiceToken = { token: data.access_token, expires: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return data.access_token;
}
function fromFirestoreValue(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ("mapValue" in v) return fromFirestoreFields(v.mapValue.fields || {});
  return null;
}
function fromFirestoreFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromFirestoreValue(v)]));
}
function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value)
    ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === "object") return { mapValue: { fields: toFirestoreFields(value) } };
  throw new Error("Unsupported order field type");
}
export function toFirestoreFields(data) {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [
    k,
    k === "createdAt" && typeof v === "string"
      ? { timestampValue: v }
      : toFirestoreValue(v)
  ]));
}
export function validateOrder(input, menu, claims) {
  if (!input || typeof input !== "object") throw new Error("Order data is missing");
  const name = String(input.customerName || "").trim();
  const phone = String(input.customerPhone || "").replace(/\D/g, "");
  const note = String(input.note || "");
  const loc = input.deliveryLocation;
  if (name.length < 2 || name.length > 70) throw new Error("कृपया सही ग्राहक नाम लिखें");
  if (phone.length !== 10) throw new Error("कृपया 10 अंकों का मोबाइल नंबर लिखें");
  if (note.length > 500) throw new Error("निर्देश 500 अक्षरों से कम रखें");
  if (!loc || typeof loc !== "object") throw new Error("डिलीवरी लोकेशन जरूरी है");
  if (loc.mode === "manual") {
    if (typeof loc.address !== "string" || loc.address.trim().length < 8 || loc.address.length > 500) {
      throw new Error("पूरा डिलीवरी पता लिखें");
    }
  } else if (loc.mode === "gps") {
    if (!Number.isFinite(loc.latitude) || loc.latitude < -90 || loc.latitude > 90
      || !Number.isFinite(loc.longitude) || loc.longitude < -180 || loc.longitude > 180
      || !Number.isFinite(loc.accuracyMeters) || loc.accuracyMeters < 0
      || typeof loc.capturedAt !== "string" || loc.capturedAt.length > 40
      || typeof loc.address !== "string" || loc.address.trim().length < 8 || loc.address.length > 500) {
      throw new Error("GPS लोकेशन या उसका पता सही नहीं है");
    }
  } else throw new Error("डिलीवरी लोकेशन का तरीका सही नहीं है");
  const menuItems = Array.isArray(menu?.items) ? menu.items : [];
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 30) {
    throw new Error("ऑर्डर में 1 से 30 मेन्यू आइटम होने चाहिए");
  }
  let total = 0;
  const cleanItems = input.items.map(line => {
    if (!line || typeof line.id !== "string" || !Number.isInteger(line.quantity)
      || line.quantity < 1 || line.quantity > 99) throw new Error("ऑर्डर की मात्रा या आइटम सही नहीं है");
    const product = menuItems.find(p => p && p.id === line.id && p.available !== false);
    if (!product) throw new Error("मेन्यू में कोई आइटम अब उपलब्ध नहीं है: " + line.id);
    const prices = Array.isArray(product.prices) ? product.prices.map(p =>
      Array.isArray(p) ? { label: String(p[0]), amount: Number(p[1]) } :
        { label: String(p.label), amount: Number(p.amount) }) : [];
    const chosen = prices.find(p => p.label === String(line.size) && Number.isFinite(p.amount)
      && p.amount === Number(line.price));
    if (!chosen) throw new Error("मेन्यू की कीमत बदल चुकी है। कृपया कार्ट अपडेट करें: " + product.hi);
    const lineTotal = chosen.amount * line.quantity;
    total += lineTotal;
    return {
      id: product.id, nameHi: String(product.hi), nameEn: String(product.en),
      size: chosen.label, price: chosen.amount, quantity: line.quantity, lineTotal
    };
  });
  if (!Number.isSafeInteger(total) || total < 0 || total > 100000) {
    throw new Error("ऑर्डर की कुल राशि स्वीकार्य सीमा से बाहर है");
  }
  return {
    customerUid: claims.sub,
    customerName: name,
    customerEmail: typeof claims.email === "string" ? claims.email.slice(0, 254) : "",
    customerPhone: phone,
    note,
    deliveryLocation: loc.mode === "manual" ? {
      mode: "manual", address: loc.address.trim()
    } : {
      mode: "gps", latitude: loc.latitude, longitude: loc.longitude,
      accuracyMeters: loc.accuracyMeters, capturedAt: loc.capturedAt,
      address: loc.address.trim(), manualAddress: loc.address.trim()
    },
    items: cleanItems, total, status: "placed"
  };
}
async function firestoreRequest(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { authorization: "Bearer " + token, "content-type": "application/json", ...(init.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Firestore request failed");
  return data;
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "https://anshmaurya5619.github.io").split(",").map(x => x.trim());
    const cors = {
      "access-control-allow-origin": allowed.includes(origin) ? origin : "null",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      "vary": "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (origin && !allowed.includes(origin)) return json({ error: "Origin not allowed" }, 403, cors);
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
    try {
      const projectId = env.FIREBASE_PROJECT_ID;
      if (!projectId) throw new Error("Firebase project ID is not configured");
      const authorization = request.headers.get("Authorization") || "";
      const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      if (!token) return json({ error: "Login required" }, 401, cors);
      const claims = await verifyFirebaseIdToken(token, projectId);
      const raw = await request.text();
      if (raw.length > 64000) return json({ error: "Order request is too large" }, 413, cors);
      const input = JSON.parse(raw);
      const serviceToken = await serviceAccessToken(env);
      const base = "https://firestore.googleapis.com/v1/projects/" + projectId + "/databases/(default)/documents";
      const menuDoc = await firestoreRequest(base + "/publicMenu/current", serviceToken);
      const menu = fromFirestoreFields(menuDoc.fields || {});
      const order = validateOrder(input, menu, claims);
      const orderId = crypto.randomUUID().replace(/-/g, "");
      const fields = toFirestoreFields({
        ...order, createdAt: new Date().toISOString()
      });
      await firestoreRequest(base + ":commit", serviceToken, {
        method: "POST",
        body: JSON.stringify({ writes: [{
          update: { name: base + "/orders/" + orderId, fields },
          currentDocument: { exists: false }
        }] })
      });
      return json({ ok: true, orderId }, 201, cors);
    } catch (error) {
      const message = String(error?.message || "Order could not be saved");
      const status = /token|login|sign-in/i.test(message) ? 401 :
        /menu|price|कीमत|मेन्यू|मात्रा|राशि|पता|लोकेशन|नाम|मोबाइल|निर्देश|ऑर्डर में/i.test(message) ? 400 : 500;
      return json({ error: message }, status, cors);
    }
  }
};