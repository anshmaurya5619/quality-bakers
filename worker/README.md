# Quality Bakers trusted order API

This Worker validates each order against the current Firestore menu before creating the order. It does not trust prices, names, line totals, customer UID, or total sent by the browser.

## Free-first deployment
1. Create a Cloudflare Worker named `quality-bakers-orders` on the Free plan.
2. Deploy this folder with Wrangler from your own Cloudflare account.
3. In Worker Settings > Variables and Secrets, add encrypted secrets:
   - `FIREBASE_SERVICE_ACCOUNT_EMAIL`: service-account email from Firebase/Google Cloud.
   - `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY`: matching private key PEM. Do not commit it or send it in chat.
4. Set the service account IAM role to the minimum Firestore data access required (Datastore User). Do not enable billing unless Cloudflare/Firebase prompts for a paid feature; stop and ask first.
5. Confirm the Firebase project ID and allowed website origin in `wrangler.toml`.
6. Deploy, then put the Worker URL into `order-api-config.js` as `ORDER_API_URL`.
7. Test customer login, manual/GPS checkout, owner order list, status changes, and tracking before publishing Firebase rules.

The Worker verifies Firebase ID tokens against Google's public signing keys and writes using the server-side service account. Never put the service-account key in the browser or repository.
