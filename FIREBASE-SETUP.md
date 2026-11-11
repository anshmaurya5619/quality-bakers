# Quality Bakers — Firebase and production setup

Firebase project: `quality-bakers-6db0b`
Existing Firestore database: `(default)` — it already exists. Do not create another database.

## Current implementation in GitHub
- Customer website: `index.html`
- Owner order dashboard: `admin.html`
- Owner menu editor: `private-menu-demo.html`
- Firebase SDK initialization: `firebase-client.js`
- Firebase web configuration and owner UID placeholder: `firebase-config.js`
- Firestore security rules: `firestore.rules`
- Image upload config template: `cloudinary-config.js`

## Authentication
The owner reports that Email/Password and Google providers are enabled in Firebase Authentication.
- Customer website supports Email/Password signup/login, Google login, password reset and order history.
- Owner pages accept Email/Password or Google, then compare the signed-in UID against `QB_ADMIN_UID`.
- Create the owner's account under Authentication > Users. Copy that account's UID.
- Replace `PASTE_OWNER_AUTH_UID` in `firebase-config.js` and `firestore.rules` with the exact owner UID. Do not use a customer UID.
- In Authentication > Settings > Authorized domains, ensure `anshmaurya5619.github.io` is listed.

## Firestore
The default database is already present. Publish `firestore.rules` in Firestore > Rules after replacing the owner UID.
Collections/documents:
- `publicMenu/current`: published menu item array.
- `orders/{autoId}`: authenticated customer order.
- `customers/{uid}`: customer profile.

The customer order total is a submitted estimate and the shop must confirm it. Do not treat a browser-supplied total as payment or final billing; payment gateway and server-side price validation are not implemented.

## Product photos — no URL entry
The menu editor accepts image files only. It center-crops and compresses them to WebP 1200×900 (4:3), previews the result, then uploads on Publish.
Firebase Storage is intentionally not used because the project is staying on Spark/free.
For image hosting, create a Cloudinary Free account and an unsigned upload preset:
- Allowed formats: jpg, jpeg, png, webp
- Max file size: 5 MB
- Folder: `quality-bakers/menu`
- Keep transformations limited to image upload.
Then put the Cloudinary cloud name and upload preset name into `cloudinary-config.js`.
Unsigned presets are public client-side upload endpoints; restrict formats/size/folder in Cloudinary and monitor usage. Never put an API secret in this repository.

## Owner pages
- `/admin.html`: order dashboard; owner can see orders and update status.
- `/private-menu-demo.html`: menu editor; owner can change names, categories, prices, availability, and upload photos.
- Public menu reads the latest `publicMenu/current` document.

## Final checks before announcing live
1. Publish Firestore rules with the real owner UID.
2. Fill Cloudinary config and create the restricted upload preset.
3. Confirm Firebase Authentication authorized domain.
4. Test customer signup/login/Google login and password reset.
5. Place a test order and confirm it appears in `admin.html`.
6. Update status and confirm it appears in the customer's order history.
7. Upload a real image and verify the crop on desktop and mobile.
8. Keep Firebase on Spark. Do not upgrade or enable billing without explicit owner approval.
