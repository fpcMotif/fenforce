import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const directory = resolve(process.argv[2]);
const documents = readdirSync(directory).filter((name) => name.endsWith('.md'));
const missing = [];

for (const name of documents) {
  const content = readFileSync(resolve(directory, name), 'utf8');
  for (const match of content.matchAll(/\]\(([^\s)]+)\)/g)) {
    const destination = match[1].split('#')[0];
    if (!destination || /^https?:/.test(destination)) continue;
    if (!existsSync(resolve(directory, destination))) {
      missing.push(`${name}: ${destination}`);
    }
  }
}

console.log(
  JSON.stringify(
    { count: missing.length, missing: [...new Set(missing)] },
    null,
    2,
  ),
);
