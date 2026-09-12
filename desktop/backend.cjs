/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require('node:module');

// Electron utility processes do not initialize NODE_PATH like the regular Node
// CLI does. Rebuild the global lookup paths before loading the Next standalone
// server from the packaged runtime.
Module._initPaths();

if (!process.env.TOPCARD_SERVER_ENTRY) throw new Error('TOPCARD_SERVER_ENTRY is missing');
require(process.env.TOPCARD_SERVER_ENTRY);
