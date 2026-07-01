import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

const envCandidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../.env'),
  resolve(process.cwd(), '../../.env'),
];

for (const path of envCandidates) {
  if (existsSync(path)) {
    loadEnv({ path });
    break;
  }
}
