require('dotenv').config();

const http = require('http');
const { createApp } = require('./app');
const { attachWebsocketServer } = require('./ws');

const port = Number(process.env.PORT || 8000);

async function main() {
  const app = await createApp();
  const server = http.createServer(app);

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`[assuredgig-node] Port ${port} is already in use. Stop the other process or set PORT to a free port.`);
      process.exitCode = 1;
      return;
    }
    console.error(err);
    process.exitCode = 1;
  });

  server.listen(port, () => {
    attachWebsocketServer(server);
    console.log(`[assuredgig-node] listening on :${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

