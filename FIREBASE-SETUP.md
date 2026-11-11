# Quality Bakers — Firebase connection setup

This repository is prepared for a Firebase-backed owner menu panel. The current editor remains a local demo until the Firebase config and owner UID are filled and the Firebase integration is enabled.

## Firebase services (free-first)
1. Create a separate Firebase project named Quality Bakers (do not reuse DHRUVA's project).
2. Register a Web app and copy its config into `firebase-config.js`.
3. Enable Authentication > Sign-in method > Email/Password.
4. Create the owner's account in Authentication. Do not create public sign-up in the admin page.
5. Copy the owner's Authentication UID into `firebase-config.js`, `firestore.rules`, and `storage.rules`.
6. Create Firestore database in production mode.
7. Create Storage bucket.
8. Publish the rules from `firestore.rules` and `storage.rules`.
9. Add Firebase SDK initialization to the admin editor and public website; test using the owner's account and a separate signed-out browser.

## Planned data model
- Firestore document: `publicMenu/current`
- Document fields: `items` (array of menu item objects), `updatedAt`, `updatedBy`.
- Each item: `id`, `hi`, `en`, `cat`, `photo`, `prices`, `available`.
- Storage path: `menu/<item-id>/<unique-file-name>`.

## Security
- Customers can read the published menu only.
- Only the exact owner UID can write the menu or upload images.
- No client-side hardcoded password. Firebase Authentication performs password verification.
- Never expose service-account JSON or private server keys in this repository.
- Keep billing on the Spark/free plan. If Firebase asks to upgrade or enable billing, stop and ask the owner first.

## Important current status
The public site and editor are not yet connected to Firestore. The configuration values and owner UID are intentionally placeholders. Do not call the admin panel secure or live until Firebase is configured, rules are deployed, and login/write/read tests pass.
