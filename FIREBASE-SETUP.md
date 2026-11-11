# Quality Bakers — Firebase setup and deployment

Firebase project: `quality-bakers-6db0b`

## Implemented in this repository
- Firebase Web SDK 13.2.0 modular initialization (`firebase-client.js`).
- Project config supplied by the owner (`firebase-config.js`).
- Owner-only menu editing rules and customer order/profile rule templates.
- Admin panel login uses Firebase Email/Password Authentication.
- Menu document: `publicMenu/current`.
- Menu photo Storage path: `menu/<item-id>/<timestamp>-<filename>`.
- Customer orders collection planned at `orders`; customer profile collection at `customers`.

## Firebase Console actions required
1. Authentication > Sign-in method > enable Email/Password.
2. Authentication > Users > Add user: create the owner's account. Do not enable public admin sign-up.
3. Copy the owner's UID into the exact placeholder in `firestore.rules` and `storage.rules`, then publish both rules.
4. Create Firestore database (production mode).
5. Create Storage bucket.
6. In Authentication > Settings > Authorized domains, ensure `anshmaurya5619.github.io` is listed.
7. Deploy the updated GitHub Pages site and test owner login, upload, publish, and public read in a signed-out browser.

## Menu document shape
`publicMenu/current`:
- `items`: array of menu item objects: `id, hi, en, cat, photo, prices, available`
- `updatedAt`: server timestamp
- `updatedBy`: owner UID

## Customer ordering
The public menu remains readable without login. Customer authentication and order placement/history UI are a separate next implementation step. The rules are prepared for customer-owned order records; do not treat ordering as live until that UI is implemented and tested.

## Security and billing
- No password is stored in source code.
- Do not commit service-account JSON or private keys.
- Owner UID must be filled in before publishing rules; until then owner writes are denied.
- Keep project on Firebase Spark/free plan. Do not upgrade or enable billing without explicit owner approval.
- Firebase web config/API key is public client configuration; access is protected by Firebase Auth, Firestore Rules, Storage Rules and optional API-key restrictions.
