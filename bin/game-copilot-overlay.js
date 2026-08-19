#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// The 'electron' npm package exports the path to its binary when required
// from a plain Node context (not from within Electron itself).
const electronPath = require('electron');
const entryPoint = path.join(__dirname, '..', 'src', 'main', 'index.js');

const child = spawn(electronPath, [entryPoint], { stdio: 'inherit' });

child.on('close', (code) => {
  process.exit(code);
});
