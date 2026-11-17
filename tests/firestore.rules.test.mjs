import { readFile } from "node:fs/promises";
import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";

const projectId = "quality-bakers-rules-test";
const ownerUid = "4iZybwaOm9hZJhdjRttjmlvnpVu1";
const customerUid = "customer-test-uid";
let env;

before(async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  env = await initializeTestEnvironment({ projectId, firestore: { rules } });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

test("public menu is readable without login", async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "publicMenu/current"), {
      items: [{ id: "burger", hi: "बर्गर", en: "Burger", cat: "snacks", photo: "https://example.com/burger.jpg", prices: [{ label: "Full", amount: 60 }] }]
    });
  });
  await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), "publicMenu/current")));
});

test("only the configured owner can publish menu changes", async () => {
  const menu = { items: [{ id: "burger", hi: "बर्गर", en: "Burger", cat: "snacks", photo: "https://example.com/burger.jpg", prices: [{ label: "Full", amount: 60 }] }] };
  const ownerDb = env.authenticatedContext(ownerUid).firestore();
  await assertSucceeds(setDoc(doc(ownerDb, "publicMenu/current"), menu));
  await assertSucceeds(updateDoc(doc(ownerDb, "publicMenu/current"), {
    items: [{ id: "burger", hi: "बर्गर", en: "Burger", cat: "snacks", photo: "https://example.com/new-burger.jpg", prices: [{ label: "Full", amount: 70 }] }]
  }));
  const published = await getDoc(doc(ownerDb, "publicMenu/current"));
  assert.equal(published.data().items.length, 1);
  assert.equal(published.data().items[0].prices[0].amount, 70);
  await assertFails(setDoc(doc(env.authenticatedContext(customerUid).firestore(), "publicMenu/current"), menu));
  await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), "publicMenu/attacker"), menu));
});

test("browser clients cannot create orders directly; trusted order API is required", async () => {
  const customerDb = env.authenticatedContext(customerUid).firestore();
  const ownerDb = env.authenticatedContext(ownerUid).firestore();
  const order = {
    customerUid,
    customerName: "Test Customer",
    customerEmail: "customer@example.com",
    customerPhone: "9876543210",
    note: "",
    deliveryLocation: { mode: "manual", address: "Test address, Jaunpur" },
    items: [{ id: "burger", nameHi: "बर्गर", nameEn: "Burger", size: "Full", price: 60, quantity: 1, lineTotal: 60 }],
    total: 60,
    status: "placed",
    createdAt: serverTimestamp()
  };
  await assertFails(setDoc(doc(customerDb, "orders/order-own"), order));
  await assertFails(setDoc(doc(ownerDb, "orders/order-from-browser"), order));
});


test("customer cannot read another customer's order or change order status", async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "orders/foreign-order"), {
      customerUid: "another-customer", status: "placed"
    });
    await setDoc(doc(context.firestore(), "orders/customer-order"), {
      customerUid, status: "placed"
    });
  });
  const customerDb = env.authenticatedContext(customerUid).firestore();
  await assertFails(getDoc(doc(customerDb, "orders/foreign-order")));
  await assertSucceeds(getDoc(doc(customerDb, "orders/customer-order")));
  await assertFails(updateDoc(doc(customerDb, "orders/customer-order"), {
    status: "completed", updatedAt: serverTimestamp()
  }));
});

test("only owner can advance a valid order status", async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "orders/status-order"), {
      customerUid, status: "placed"
    });
  });
  const ownerDb = env.authenticatedContext(ownerUid).firestore();
  await assertSucceeds(updateDoc(doc(ownerDb, "orders/status-order"), {
    status: "confirmed", updatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(doc(ownerDb, "orders/status-order"), {
    status: "completed", updatedAt: serverTimestamp()
  }));
});

test("owner GPS tracking is allowed only for active delivery statuses", async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "orders/gps-order"), {
      customerUid, status: "placed"
    });
  });
  const ownerDb = env.authenticatedContext(ownerUid).firestore();
  const location = {
    latitude: 25.75, longitude: 82.68, accuracyMeters: 15,
    capturedAt: new Date().toISOString(), active: true
  };
  await assertFails(updateDoc(doc(ownerDb, "orders/gps-order"), {
    ownerLocation: location, trackingUpdatedAt: serverTimestamp()
  }));
  await assertSucceeds(updateDoc(doc(ownerDb, "orders/gps-order"), {
    status: "confirmed", updatedAt: serverTimestamp()
  }));
  await assertSucceeds(updateDoc(doc(ownerDb, "orders/gps-order"), {
    ownerLocation: location, trackingUpdatedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(doc(env.authenticatedContext(customerUid).firestore(), "orders/gps-order"), {
    ownerLocation: { ...location, active: false }, trackingUpdatedAt: serverTimestamp()
  }));
});

test("customer profile and saved addresses are private and bounded to 10", async () => {
  const ownDb = env.authenticatedContext(customerUid).firestore();
  const profileRef = doc(ownDb, "customers/" + customerUid);
  await assertSucceeds(setDoc(profileRef, {
    uid: customerUid, name: "Test Customer", email: "customer@example.com",
    phone: "9876543210", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    addresses: [{ label: "Home", address: "House 1, Main Road", createdAt: new Date().toISOString() }]
  }));
  await assertSucceeds(getDoc(profileRef));
  await assertSucceeds(updateDoc(profileRef, {
    addresses: [{ label: "Home", address: "House 1, Main Road", createdAt: new Date().toISOString() }],
    updatedAt: serverTimestamp()
  }));
  const tooMany = Array.from({ length: 11 }, (_, i) => ({
    label: "Address " + i, address: "House " + i + ", Main Road", createdAt: new Date().toISOString()
  }));
  await assertFails(updateDoc(profileRef, { addresses: tooMany, updatedAt: serverTimestamp() }));
  await assertFails(getDoc(doc(env.authenticatedContext("other-customer").firestore(), "customers/" + customerUid)));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "customers/" + customerUid)));
});

test("owner can publish and delete announcements; customers are read-only", async () => {
  const ownerDb = env.authenticatedContext(ownerUid).firestore();
  const customerDb = env.authenticatedContext(customerUid).firestore();
  const announcement = doc(ownerDb, "announcements/notice-1");
  await assertSucceeds(setDoc(announcement, {
    title: "Weekend Offer", message: "Fresh menu today", createdAt: serverTimestamp(), createdBy: ownerUid
  }));
  await assertSucceeds(getDoc(doc(customerDb, "announcements/notice-1")));
  await assertFails(setDoc(doc(customerDb, "announcements/notice-2"), {
    title: "Fake", message: "Not allowed", createdAt: serverTimestamp(), createdBy: customerUid
  }));
  await assertFails(updateDoc(announcement, { message: "Tampered" }));
});

test("owner status updates require legal progression and timestamp", async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "orders/transition-order"), { customerUid, status: "placed" });
  });
  const ownerDb = env.authenticatedContext(ownerUid).firestore();
  await assertFails(updateDoc(doc(ownerDb, "orders/transition-order"), {
    status: "completed", updatedAt: serverTimestamp()
  }));
  await assertSucceeds(updateDoc(doc(ownerDb, "orders/transition-order"), {
    status: "confirmed", updatedAt: serverTimestamp()
  }));
});
