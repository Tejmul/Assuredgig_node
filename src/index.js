require('dotenv').config();

const http = require('http');
const { createApp } = require('./app');
const { attachWebsocketServer } = require('./ws');

const port = Number(process.env.PORT || 8000);

async function main() {
  const app = await createApp();
  const server = http.createServer(app);

  attachWebsocketServer(server);

  server.listen(port, () => {
    console.log(`[assuredgig-node] listening on :${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

