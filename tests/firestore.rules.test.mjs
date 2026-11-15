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
      items: [{ id: "burger", hi: "बर्गर", en: "Burger", cat: "snacks", photo: "https://example.com/burger.jpg", prices: [["Full", 60]] }]
    });
  });
  await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), "publicMenu/current")));
});

test("only the configured owner can publish menu changes", async () => {
  const menu = { items: [{ id: "burger", hi: "बर्गर", en: "Burger", cat: "snacks", photo: "https://example.com/burger.jpg", prices: [["Full", 60]] }] };
  await assertSucceeds(setDoc(doc(env.authenticatedContext(ownerUid).firestore(), "publicMenu/current"), menu));
  await assertFails(setDoc(doc(env.authenticatedContext(customerUid).firestore(), "publicMenu/current"), menu));
  await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), "publicMenu/attacker"), menu));
});

test("customer can create an order only under their own UID", async () => {
  const db = env.authenticatedContext(customerUid).firestore();
  const order = {
    customerUid,
    customerName: "Test Customer",
    customerEmail: "customer@example.com",
    customerPhone: "9876543210",
    note: "",
    deliveryLocation: { mode: "manual", address: "Test address, Jaunpur" },
    items: [{ id: "burger", nameHi: "बर्गर", quantity: 1, price: 60 }],
    total: 60,
    status: "placed",
    createdAt: serverTimestamp()
  };
  await assertSucceeds(setDoc(doc(db, "orders/order-own"), order));
  await assertFails(setDoc(doc(db, "orders/order-other"), { ...order, customerUid: "someone-else" }));
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

test("customer profile is private to its authenticated UID", async () => {
  const ownDb = env.authenticatedContext(customerUid).firestore();
  await assertSucceeds(setDoc(doc(ownDb, "customers/" + customerUid), {
    uid: customerUid, name: "Test Customer", email: "customer@example.com",
    phone: "9876543210", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    addresses: []
  }));
  await assertSucceeds(getDoc(doc(ownDb, "customers/" + customerUid)));
  await assertFails(getDoc(doc(env.authenticatedContext("other-customer").firestore(), "customers/" + customerUid)));
});
