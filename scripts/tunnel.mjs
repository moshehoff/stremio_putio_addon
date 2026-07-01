import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '.env') });

const port = process.env.PORT ?? '7000';
const target = `http://127.0.0.1:${port}`;
const tunnelUrlPattern = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

let installUrlPrinted = false;

function maybePrintInstallUrl(text) {
  const match = text.match(tunnelUrlPattern);
  if (!match || installUrlPrinted) {
    return;
  }
  installUrlPrinted = true;
  const manifestUrl = `${match[0]}/manifest.json`;
  console.log('\n========================================');
  console.log('Stremio install URL (HTTPS):');
  console.log(manifestUrl);
  console.log('');
  console.log('1. Keep npm run dev running in another terminal');
  console.log('2. Install in Stremio Web or Desktop (same account as phone)');
  console.log('3. Android syncs the addon automatically');
  console.log('========================================\n');
}

function resolveCloudflaredPath() {
  if (process.env.CLOUDFLARED_PATH && existsSync(process.env.CLOUDFLARED_PATH)) {
    return process.env.CLOUDFLARED_PATH;
  }

  const candidates = [
    join(homedir(), 'Downloads', 'cloudflared-windows-amd64.exe'),
    join(homedir(), 'Downloads', 'cloudflared.exe'),
    'cloudflared',
  ];

  for (const candidate of candidates) {
    if (candidate === 'cloudflared') {
      const found = spawnSync('where', ['cloudflared'], { shell: true });
      if (found.status === 0) {
        return 'cloudflared';
      }
      continue;
    }
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

const cloudflared = resolveCloudflaredPath();
if (!cloudflared) {
  console.error('cloudflared not found.');
  console.error('');
  console.error('Option 1 — add to .env:');
  console.error('  CLOUDFLARED_PATH=C:\\Users\\YOU\\Downloads\\cloudflared-windows-amd64.exe');
  console.error('');
  console.error('Option 2 — install to PATH:');
  console.error('  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
  process.exit(1);
}

console.log(`Cloudflare Tunnel → ${target}`);
console.log(`Using: ${cloudflared}\n`);

const child = spawn(cloudflared, ['tunnel', '--url', target], {
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: false,
  windowsHide: true,
});

child.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  maybePrintInstallUrl(text);
});

child.stderr.on('data', (chunk) => {
  const text = chunk.toString();
  process.stderr.write(text);
  maybePrintInstallUrl(text);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});

process.on('SIGINT', () => {
  child.kill('SIGINT');
});
