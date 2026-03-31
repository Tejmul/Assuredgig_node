const { createApp } = require("../src/app");

let app;

module.exports = async (req, res) => {
  if (!app) {
    app = await createApp();
  }
  return app(req, res);
};