import test from "node:test";
import assert from "node:assert/strict";
import { validateOrder, toFirestoreFields } from "./index.js";

const menu = { items: [
  { id: "burger", hi: "बर्गर", en: "Burger", available: true,
    prices: [{ label: "Half", amount: 40 }, { label: "Full", amount: 60 }] },
  { id: "momo", hi: "मोमोज़", en: "Momos", prices: [["Plate", 50]] }
] };
const claims = { sub: "customer-123", email: "customer@example.com" };
const base = {
  customerName: "Test Customer", customerPhone: "9876543210", note: "",
  deliveryLocation: { mode: "manual", address: "House 1, Main Road, Lucknow" },
  items: [{ id: "burger", nameHi: "tampered", nameEn: "tampered", size: "Full",
    price: 60, quantity: 2, lineTotal: 1 }], total: 1
};

test("uses current menu prices and recalculates order total", () => {
  const result = validateOrder(base, menu, claims);
  assert.equal(result.total, 120);
  assert.equal(result.items[0].lineTotal, 120);
  assert.equal(result.items[0].nameHi, "बर्गर");
  assert.equal(result.customerUid, "customer-123");
});
test("rejects a forged price", () => {
  assert.throws(() => validateOrder({ ...base, items: [{ ...base.items[0], price: 1 }] }, menu, claims), /कीमत बदल चुकी है/);
});
test("rejects a stale or unavailable menu item", () => {
  assert.throws(() => validateOrder({ ...base, items: [{ ...base.items[0], id: "gone" }] }, menu, claims), /उपलब्ध नहीं है/);
});
test("rejects invalid delivery address", () => {
  assert.throws(() => validateOrder({ ...base, deliveryLocation: { mode: "manual", address: "short" } }, menu, claims), /पूरा डिलीवरी पता/);
});
test("accepts the site's GPS payload including reverse-geocoded address", () => {
  const result = validateOrder({ ...base, deliveryLocation: {
    mode: "gps", latitude: 25.75, longitude: 82.68, accuracyMeters: 12000,
    capturedAt: new Date().toISOString(), address: "House 1, Main Road, Lucknow",
    manualAddress: "House 1, Main Road, Lucknow"
  } }, menu, claims);
  assert.equal(result.deliveryLocation.mode, "gps");
});
test("rejects invalid quantities and excessive totals", () => {
  assert.throws(() => validateOrder({ ...base, items: [{ ...base.items[0], quantity: 0 }] }, menu, claims), /मात्रा/);
});

test("trusted order createdAt is encoded as a Firestore timestamp", () => {
  const fields = toFirestoreFields({ createdAt: "2026-11-17T10:00:00.000Z", status: "placed" });
  assert.deepEqual(fields.createdAt, { timestampValue: "2026-11-17T10:00:00.000Z" });
  assert.deepEqual(fields.status, { stringValue: "placed" });
});
