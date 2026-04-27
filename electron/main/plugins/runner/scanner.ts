import * as fs from 'node:fs';
import * as path from 'node:path';
import { getAmazonSkillsDir } from '../../../utils/paths';

export interface PluginTool {
  id: string; // Relative path or unique ID
  path: string; // Absolute path to the .py script
  name: string;
  description: string;
  stage: number;
  type: 'scraper' | 'filter' | 'finalize';
  arguments: any[];
  outputs: string[];
}

export function scanTools(): PluginTool[] {
  const AMAZON_SKILLS_PATH = getAmazonSkillsDir();
  const tools: PluginTool[] = [];
  if (!fs.existsSync(AMAZON_SKILLS_PATH)) {
    console.warn(`[Scanner] Amazon skills path not found: ${AMAZON_SKILLS_PATH}`);
    return [];
  }

  const findUiJson = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findUiJson(fullPath);
      } else if (entry.name.endsWith('.ui.json')) {
        try {
          const content = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
          const pyPath = fullPath.replace('.ui.json', '.py');
          if (fs.existsSync(pyPath)) {
            tools.push({
              id: path.basename(pyPath, '.py'),
              path: pyPath,
              ...content,
            });
          }
        } catch (e) {
          console.error(`[Scanner] Failed to parse ${fullPath}:`, e);
        }
      }
    }
  };

  findUiJson(AMAZON_SKILLS_PATH);
  return tools.sort((a, b) => (a.stage || 0) - (b.stage || 0));
}
