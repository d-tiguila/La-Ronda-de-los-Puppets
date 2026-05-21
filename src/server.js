import { createServer } from "node:http";
import { config } from "./lib/config.js";
import { handleHttpRequest } from "./lib/http.js";
import { RealtimeHub } from "./lib/realtime.js";

if (config.isProduction && !config.tdToken) {
  throw new Error("TD_TOKEN is required when NODE_ENV=production.");
}

let hub;
const server = createServer((request, response) => {
  handleHttpRequest(request, response, () => hub.snapshot());
});

hub = new RealtimeHub(server);
hub.startHeartbeat();

server.listen(config.port, () => {
  console.log(`Marionetas controller listening on port ${config.port}.`);
});

function shutdown() {
  hub.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

