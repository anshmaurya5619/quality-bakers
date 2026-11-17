import { readFile } from "node:fs/promises";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { ref, uploadBytes, getBytes, deleteObject } from "firebase/storage";

const projectId = "quality-bakers-storage-rules-test";
const ownerUid = "4iZybwaOm9hZJhdjRttjmlvnpVu1";
let env;

before(async () => {
  const rules = await readFile(new URL("../storage.rules", import.meta.url), "utf8");
  env = await initializeTestEnvironment({ projectId, storage: { rules } });
});
after(async () => { await env?.cleanup(); });

test("public can read a menu image", async () => {
  const ownerStorage = env.authenticatedContext(ownerUid).storage();
  const path = ref(ownerStorage, "menu/test.png");
  await uploadBytes(path, new Uint8Array([1, 2, 3]), { contentType: "image/png" });
  await assertSucceeds(getBytes(ref(env.unauthenticatedContext().storage(), "menu/test.png")));
});

test("only owner can upload, replace and delete menu images", async () => {
  const ownerStorage = env.authenticatedContext(ownerUid).storage();
  const customerStorage = env.authenticatedContext("customer-uid").storage();
  const ownerPath = ref(ownerStorage, "menu/owner.png");
  await assertSucceeds(uploadBytes(ownerPath, new Uint8Array([1, 2, 3]), { contentType: "image/png" }));
  await assertSucceeds(uploadBytes(ownerPath, new Uint8Array([4, 5, 6]), { contentType: "image/webp" }));
  await assertFails(uploadBytes(ref(customerStorage, "menu/customer.png"), new Uint8Array([1]), { contentType: "image/png" }));
  await assertFails(uploadBytes(ref(ownerStorage, "menu/bad.svg"), new Uint8Array([1]), { contentType: "image/svg+xml" }));
  await assertSucceeds(deleteObject(ownerPath));
  await assertFails(uploadBytes(ref(customerStorage, "other/customer.png"), new Uint8Array([1]), { contentType: "image/png" }));
});
