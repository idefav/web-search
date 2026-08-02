import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const server = createApp(config).listen(config.port, config.bindHost, () => {
  process.stdout.write(`${JSON.stringify({ level: "info", message: "server_started", host: config.bindHost, port: config.port })}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
