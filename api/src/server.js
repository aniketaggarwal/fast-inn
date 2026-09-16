require("dotenv").config();
const { createApp } = require("./app");

const port = process.env.PORT || 4000;
const app = createApp();

app.listen(port, () => {
  console.log(`api listening on :${port}`);
});
