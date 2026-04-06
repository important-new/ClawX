import * as fs from 'node:fs';
import * as path from 'node:path';

const AMAZON_SKILLS_PATH = 'd:\\Code\\amazon\\.agent\\skills';

function scanTools() {
  const tools = [];
  const findUiJson = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findUiJson(fullPath);
      } else if (entry.name.endsWith('.ui.json')) {
        const pyPath = fullPath.replace('.ui.json', '.py');
        tools.push({ id: entry.name, path: pyPath });
      }
    }
  };
  findUiJson(AMAZON_SKILLS_PATH);
  return tools;
}

console.log('Scanning tools...');
const tools = scanTools();
console.log(`Found ${tools.length} tools:`);
tools.forEach(t => console.log(`- ${t.id}`));
