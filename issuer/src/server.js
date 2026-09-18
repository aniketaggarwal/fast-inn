require("dotenv").config();
const { createApp } = require("./app");
const { loadOrCreateKeys } = require("./keys");
const { ensureBucket } = require("./storage/s3");

const port = process.env.PORT || 4001;

(async () => {
  const { kid } = await loadOrCreateKeys();
  console.log(`issuer signing key loaded (kid: ${kid})`);

  await ensureBucket();

  const app = createApp();
  app.listen(port, process.env.HOST || undefined, () => {
    console.log(`issuer listening on :${port}`);
  });
})().catch((err) => {
  console.error("issuer failed to start:", err);
  process.exit(1);
});
