// Starts SpecLens on this computer: npm start, then open the address it prints.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHttpServer } from './src/http/server.js';
import { createService } from './src/services/speclens-service.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? '127.0.0.1';
const dataDir = path.resolve(root, process.env.SPECLENS_DATA_DIR ?? '.speclens');

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('SpecLens could not start: PORT must be a whole number from 0 to 65535.');
  process.exit(1);
}

let service;
try {
  service = await createService({
    dataDir,
    seedPath: path.join(root, 'demo-app', 'tracker.defective.js'),
  });
} catch (error) {
  console.error(`SpecLens could not start: ${error.message}`);
  process.exit(1);
}

const server = createHttpServer({ service, publicDir: path.join(root, 'public'), host });

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`SpecLens could not start: port ${port} is already in use. Set another port first. PowerShell: $env:PORT=${port + 1}; npm start. macOS and Linux: PORT=${port + 1} npm start`);
  } else {
    console.error(`SpecLens could not start: ${error.message}`);
  }
  process.exit(1);
});

server.listen(port, host, () => {
  const shown = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
  console.log(`SpecLens is running at http://${shown}:${server.address().port}`);
  console.log('Press Control and C to stop it. Your work is saved in the .speclens folder.');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  });
}
