require("dotenv").config();
const { createApp } = require("./app");
const { ensureConnected } = require("./redis");

const port = process.env.PORT || 4000;

(async () => {
  await ensureConnected();
  console.log("redis connected");

  const app = createApp();
  app.listen(port, process.env.HOST || undefined, () => {
    console.log(`api listening on :${port}`);
  });
})().catch((err) => {
  console.error("api failed to start:", err);
  process.exit(1);
});
