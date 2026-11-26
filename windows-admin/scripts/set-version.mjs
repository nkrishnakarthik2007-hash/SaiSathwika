import { readFile, writeFile } from 'node:fs/promises';

const runNumber = Number(process.env.GITHUB_RUN_NUMBER || 1);
if (!Number.isInteger(runNumber) || runNumber < 1) {
  throw new Error('GITHUB_RUN_NUMBER must be a positive integer.');
}

const path = 'src-tauri/tauri.conf.json';
const config = JSON.parse(await readFile(path, 'utf8'));
config.version = '0.1.' + runNumber;
await writeFile(path, JSON.stringify(config, null, 2) + '\n', 'utf8');
console.log('Windows admin version set to ' + config.version);
