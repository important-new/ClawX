/**
 * Amazon Selection Assistant — dedicated IPC handlers.
 *
 * All Amazon-specific IPC lives here so that ipc-handlers.ts only needs a
 * single import line.  When ClawX core updates, conflicts are limited to that
 * one line.
 *
 * Channels registered here:
 *   amazon:saveMcpConfig      — write mcpServers to openclaw.json + auto-reload
 *   amazon:readMcpConfig      — read mcpServers from openclaw.json
 *   amazon:selectSkillDir     — show OS directory-picker dialog
 *   amazon:readSkillMeta      — parse SKILL.md frontmatter from a directory
 *   amazon:listUserSkills     — list skills in ~/.openclaw/skills/ with metadata
 *   amazon:installSkillFromPath — copy skill dir to skills dir + reload
 *   amazon:removeSkill        — remove skill dir from skills dir + reload
 *   amazon:exportBackup       — write localStorage snapshot to a user-chosen JSON file
 *   amazon:importBackup       — read a backup JSON file and return its contents
 *   amazon:exportCsv          — write analysis sessions as CSV to a user-chosen file
 *   amazon:exportPdf          — print the current window to PDF and save
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import {
  readdir, readFile, writeFile, mkdir, rm, cp,
  stat,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { GatewayManager } from '../gateway/manager';
import { readOpenClawConfig, writeOpenClawConfig } from '../utils/channel-config';
import { getOpenClawSkillsDir } from '../utils/paths';
import { logger } from '../utils/logger';
import { scanTools } from './plugins/runner/scanner';
import { ToolExecutor } from './plugins/runner/executor';
import { WorkflowExecutor, Workflow } from './plugins/runner/workflow-executor';
import { amazonWorkflowStore } from './plugins/runner/store';
import { AmazonScheduler } from './plugins/runner/scheduler';
import { AMZ_FILTER_LABELS } from './plugins/amazon/filter-metadata';

// ─── SKILL.md frontmatter parser ─────────────────────────────────────────────
// Parses simple YAML frontmatter without an external dependency.

interface SkillMeta {
  slug: string
  name: string
  version: string
  description: string
  author: string
  /** Raw frontmatter fields */
  extra: Record<string, string>
}

function parseSkillMd(content: string, fallbackSlug: string): SkillMeta {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const meta: Record<string, string> = {}

  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const m = line.match(/^(\w[\w-]*):\s*["']?(.+?)["']?\s*$/)
      if (m) meta[m[1].toLowerCase()] = m[2]
    }
  }

  return {
    slug: meta['slug'] ?? fallbackSlug,
    name: meta['name'] ?? fallbackSlug,
    version: meta['version'] ?? '0.0.0',
    description: meta['description'] ?? '',
    author: meta['author'] ?? '',
    extra: meta,
  }
}

// ─── Shared Runner State ───────────────────────────────────────────────────
let runner: ToolExecutor | null = null;
let workflowRunner: WorkflowExecutor | null = null;
let scheduler: AmazonScheduler | null = null;

export function registerAmazonHandlers(gatewayManager: GatewayManager, mainWindow: BrowserWindow): void {
  console.log('>>> [amazon] REGISTERING HANDLERS...');
  try {
    if (!runner) {
      runner = new ToolExecutor();
      workflowRunner = new WorkflowExecutor(runner);
      scheduler = new AmazonScheduler(runner);
    }
  } catch (err) {
    console.error('>>> [amazon] CRITICAL: FAILED TO INITIALIZE RUNNER/SCHEDULER:', err);
  }

  // ── MCP config ─────────────────────────────────────────────────────────────

  ipcMain.handle('amazon:saveMcpConfig', async (_, mcpServers: Record<string, unknown>) => {
    try {
      const config = await readOpenClawConfig()
      if (Object.keys(mcpServers).length === 0) {
        delete config.mcpServers
      } else {
        config.mcpServers = mcpServers
      }
      await writeOpenClawConfig(config)
      logger.info('[amazon] Saved mcpServers:', Object.keys(mcpServers))
      gatewayManager.debouncedReload()
      return { success: true }
    } catch (err) {
      logger.error('[amazon] saveMcpConfig failed:', err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('amazon:readMcpConfig', async () => {
    try {
      const config = await readOpenClawConfig()
      return { success: true, mcpServers: (config.mcpServers as Record<string, unknown>) ?? {} }
    } catch (err) {
      return { success: false, mcpServers: {}, error: String(err) }
    }
  })

  // ── Skill management ────────────────────────────────────────────────────────

  /**
   * Open a native directory-picker dialog.
   * Returns { canceled, filePaths } — the same shape as Electron's dialog API.
   */
  ipcMain.handle('amazon:selectSkillDir', async () => {
    logger.info('[amazon] Receiving IPC: amazon:selectSkillDir');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 Skill 目录',
      properties: ['openDirectory'],
      buttonLabel: '选择',
    });
    logger.info('[amazon] selectSkillDir result:', { canceled: result.canceled, pathCount: result.filePaths.length });
    return result;
  })

  /**
   * Read and parse SKILL.md from a given directory path.
   * Returns SkillMeta or an error.
   */
  ipcMain.handle('amazon:readSkillMeta', async (_, dirPath: string) => {
    logger.info(`[amazon] Reading skill meta from: ${dirPath}`);
    try {
      const skillMdPath = join(dirPath, 'SKILL.md')
      if (!existsSync(skillMdPath)) {
        logger.warn(`[amazon] SKILL.md not found in ${dirPath}`);
        return { success: false, error: '目录中未找到 SKILL.md 文件' }
      }
      const content = await readFile(skillMdPath, 'utf-8')
      const slug = basename(dirPath)
      const meta = parseSkillMd(content, slug)
      logger.info(`[amazon] Successfully read skill meta for "${meta.name}" (${meta.slug})`);
      return { success: true, meta }
    } catch (err) {
      logger.error(`[amazon] Error reading skill meta from ${dirPath}:`, err);
      return { success: false, error: String(err) }
    }
  })

  /**
   * List all skills in ~/.openclaw/skills/ with parsed metadata.
   * Skips directories without SKILL.md.
   */
  ipcMain.handle('amazon:listUserSkills', async () => {
    try {
      const skillsDir = getOpenClawSkillsDir()
      if (!existsSync(skillsDir)) return { success: true, skills: [] }

      const entries = await readdir(skillsDir, { withFileTypes: true })
      const skills: Array<SkillMeta & { path: string; installedAt?: number }> = []

      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const dirPath = join(skillsDir, entry.name)
        const skillMdPath = join(dirPath, 'SKILL.md')
        if (!existsSync(skillMdPath)) continue

        try {
          const content = await readFile(skillMdPath, 'utf-8')
          const meta = parseSkillMd(content, entry.name)
          const dirStat = await stat(dirPath)
          skills.push({ ...meta, path: dirPath, installedAt: dirStat.ctimeMs })
        } catch {
          // skip unreadable skill dirs
        }
      }

      return { success: true, skills }
    } catch (err) {
      return { success: false, skills: [], error: String(err) }
    }
  })

  /**
   * Copy a skill directory into ~/.openclaw/skills/<slug>/ then reload Gateway.
   * If a skill with the same slug already exists it is replaced.
   */
  ipcMain.handle('amazon:installSkillFromPath', async (_, srcPath: string) => {
    logger.info(`[amazon] Installing skill from path: ${srcPath}`);
    try {
      const skillMdPath = join(srcPath, 'SKILL.md')
      if (!existsSync(skillMdPath)) {
        logger.warn(`[amazon] Installation failed: SKILL.md missing in ${srcPath}`);
        return { success: false, error: '源目录中未找到 SKILL.md，无法安装' }
      }

      const content = await readFile(skillMdPath, 'utf-8')
      const slug = basename(srcPath)
      const meta = parseSkillMd(content, slug)

      const skillsDir = getOpenClawSkillsDir()
      await mkdir(skillsDir, { recursive: true })

      const destPath = join(skillsDir, meta.slug)

      // Remove existing installation if present
      if (existsSync(destPath)) {
        logger.info(`[amazon] Removing existing skill installation at ${destPath}`);
        await rm(destPath, { recursive: true, force: true })
      }

      // Copy entire skill directory
      logger.info(`[amazon] Copying skill directory to ${destPath}`);
      await cp(srcPath, destPath, { recursive: true })

      logger.info(`[amazon] Skill "${meta.slug}" installed successfully. Reloading Gateway...`);
      gatewayManager.debouncedReload()

      return { success: true, slug: meta.slug, meta }
    } catch (err) {
      logger.error(`[amazon] installSkillFromPath failed for ${srcPath}:`, err)
      return { success: false, error: String(err) }
    }
  })

  /**
   * Remove a skill directory from ~/.openclaw/skills/<slug>/ then reload.
   */
  ipcMain.handle('amazon:removeSkill', async (_, slug: string) => {
    try {
      const skillsDir = getOpenClawSkillsDir()
      const destPath = join(skillsDir, slug)

      if (!existsSync(destPath)) {
        return { success: false, error: `Skill "${slug}" 不存在` }
      }

      await rm(destPath, { recursive: true, force: true })
      logger.info(`[amazon] Removed skill "${slug}"`)
      gatewayManager.debouncedReload()

      return { success: true }
    } catch (err) {
      logger.error('[amazon] removeSkill failed:', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Backup / restore ────────────────────────────────────────────────────────

  /**
   * Show a "Save File" dialog and write the provided JSON backup to disk.
   * The payload (localStorage snapshots) is assembled in the renderer.
   */
  ipcMain.handle('amazon:exportBackup', async (_, payload: unknown) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: '导出选品助手备份',
        defaultPath: `amazon-backup-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
        buttonLabel: '导出',
      })
      if (canceled || !filePath) return { success: false, canceled: true }

      await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8')
      logger.info('[amazon] Exported backup to', filePath)
      return { success: true, filePath }
    } catch (err) {
      logger.error('[amazon] exportBackup failed:', err)
      return { success: false, error: String(err) }
    }
  })

  // ── File exports ────────────────────────────────────────────────────────────

  /**
   * Write analysis sessions as a CSV file.
   * The renderer builds the CSV string; IPC shows the save dialog and writes.
   */
  ipcMain.handle('amazon:exportCsv', async (_, csvContent: string, defaultName: string) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: '导出 CSV',
        defaultPath: defaultName,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
        buttonLabel: '导出',
      })
      if (canceled || !filePath) return { success: false, canceled: true }

      // Add UTF-8 BOM so Excel opens Chinese characters correctly
      await writeFile(filePath, '\uFEFF' + csvContent, 'utf-8')
      logger.info('[amazon] Exported CSV to', filePath)
      return { success: true, filePath }
    } catch (err) {
      logger.error('[amazon] exportCsv failed:', err)
      return { success: false, error: String(err) }
    }
  })

  /**
   * Print the current window to PDF and save to a user-chosen file.
   */
  ipcMain.handle('amazon:exportPdf', async (_, defaultName: string) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: '导出 PDF',
        defaultPath: defaultName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
        buttonLabel: '导出',
      })
      if (canceled || !filePath) return { success: false, canceled: true }
 
      const pdfData = await mainWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
      })
      await writeFile(filePath, pdfData)
      logger.info('[amazon] Exported PDF to', filePath)
      return { success: true, filePath }
    } catch (err) {
      logger.error('[amazon] exportPdf failed:', err)
      return { success: false, error: String(err) }
    }
  })

  /**
   * Show an "Open File" dialog, read the selected backup JSON, and return it.
   * The renderer is responsible for writing the data back to localStorage.
   */
  ipcMain.handle('amazon:importBackup', async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: '导入选品助手备份',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
        buttonLabel: '导入',
      })
      if (canceled || !filePaths.length) return { success: false, canceled: true }

      const raw = await readFile(filePaths[0], 'utf-8')
      const data = JSON.parse(raw) as unknown
      logger.info('[amazon] Loaded backup from', filePaths[0])
      return { success: true, data }
    } catch (err) {
      logger.error('[amazon] importBackup failed:', err)
      return { success: false, error: String(err) }
    }
  })

  // ── Runner / Plugin Tools ──────────────────────────────────────────────────
  
  ipcMain.handle('amazon:listTools', async () => {
    try {
      const tools = scanTools();
      
      // Enforce non-intrusive deep loading: resolve defaults from filters_default.json
      // This logic is kept here because it is Amazon-specific.
      const enrichedTools = tools.map(tool => {
        const toolDir = join(tool.path, '..');
        const filtersPath = join(toolDir, 'filters_default.json');
        
        if (existsSync(filtersPath)) {
          try {
            const filterData = JSON.parse(require('node:fs').readFileSync(filtersPath, 'utf-8'));
            const currentArgs = tool.arguments || [];
            const expandedArgs = [...currentArgs];

            // 1. Update defaults for existing args
            expandedArgs.forEach((arg: any, index: number) => {
              const jsonKey = arg.name.replace(/-/g, '_');
              if (filterData[jsonKey] !== undefined) {
                expandedArgs[index] = { ...arg, default: filterData[jsonKey] };
              }
            });

            // 2. Expand: Add fields from JSON that aren't in ui.json
            Object.entries(filterData).forEach(([key, val]) => {
              if (key.startsWith('_')) return;
              const argName = key.replace(/_/g, '-');
              if (!expandedArgs.find((a: any) => a.name === argName || a.name === key)) {
                expandedArgs.push({
                  name: `filter:${key}`, // Use prefix to identify expanded filters
                  label: AMZ_FILTER_LABELS[key] || key,
                  type: typeof val === 'number' ? 'number' : typeof val === 'boolean' ? 'boolean' : 'string',
                  default: val,
                  help: `来源于配置文件: ${key}`
                });
              }
            });

            return { ...tool, arguments: expandedArgs };
          } catch (e) {
            logger.warn(`[amazon] Failed to enrich defaults for ${tool.id}:`, e);
          }
        }
        return tool;
      });

      return { success: true, tools: enrichedTools };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('amazon:runTool', async (event, toolId: string, args: string[]) => {
    try {
      const tools = scanTools();
      const tool = tools.find(t => t.id === toolId);
      if (!tool) return { success: false, error: `Tool ${toolId} not found` };

      if (runner?.isRunning()) {
        return { success: false, error: 'Already running another tool' };
      }

      // Progress listener
      const onProgress = (data: any) => {
        event.sender.send('amazon:toolProgress', { toolId, ...data });
      };
      const onIntervention = (data: any) => {
        event.sender.send('amazon:toolIntervention', { toolId, ...data });
      };
      const onOutput = (data: string) => {
        event.sender.send('amazon:toolOutput', { toolId, output: data });
      };

      runner?.on('progress', onProgress);
      runner?.on('intervention', onIntervention);
      runner?.on('output', onOutput);

      try {
        const result = await runner?.execute(tool.path, args);
        return { success: true, result };
      } finally {
        runner?.off('progress', onProgress);
        runner?.off('intervention', onIntervention);
        runner?.off('output', onOutput);
      }
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('amazon:stopTool', async () => {
    runner?.stop();
    return { success: true };
  });

  ipcMain.handle('amazon:getToolStatus', async () => {
    return { 
      running: !!runner?.isRunning(),
      workflowRunning: !!workflowRunner?.getHealth().isRunning
    };
  });

  ipcMain.handle('amazon:runWorkflow', async (event, workflow: Workflow) => {
    try {
      const tools = scanTools();
      if (runner?.isRunning()) {
        return { success: false, error: 'Already running another task' };
      }

      // Re-use progress listeners
      const onProgress = (data: any) => {
        event.sender.send('amazon:workflowProgress', { workflowId: workflow.id, ...data });
      };
      const onIntervention = (data: any) => {
        event.sender.send('amazon:workflowIntervention', { workflowId: workflow.id, ...data });
      };

      runner?.on('progress', onProgress);
      runner?.on('intervention', onIntervention);

      try {
      // ── Process Expanded Filters ──────────────────────────────────────────
      // If a step has 'filter:xxx' arguments, synthesize a temp JSON and override --filters-file
      for (const step of workflow.steps) {
        const filterArgs = Object.keys(step.args).filter(k => k.startsWith('filter:'));
        if (filterArgs.length > 0) {
          try {
            const session = step.args['session'] || 'default';
            const tempDir = join(join('d:\\Code\\amazon\\.agent\\skills', 'report'), 'sessions', session);
            if (!existsSync(tempDir)) await mkdir(tempDir, { recursive: true });
            
            const tempFiltersPath = join(tempDir, `wizard_filters_${step.toolId.replace(/:/g, '_')}.json`);
            
            // Load base filters from tool dir if possible
            const tool = scanTools().find(t => t.id === step.toolId);
            let baseFilters = {};
            if (tool) {
              const filtersPath = join(join(tool.path, '..'), 'filters_default.json');
              if (existsSync(filtersPath)) {
                baseFilters = JSON.parse(require('node:fs').readFileSync(filtersPath, 'utf-8'));
              }
            }

            // Apply overrides
            const finalFilters = { ...baseFilters };
            filterArgs.forEach(k => {
              const jsonKey = k.replace('filter:', '');
              finalFilters[jsonKey] = step.args[k];
              delete step.args[k]; // Cleanup to avoid passing to CLI as individual flags
            });

            await writeFile(tempFiltersPath, JSON.stringify(finalFilters, null, 2), 'utf-8');
            logger.info(`[amazon] Synthesized temp filters for ${step.toolId} -> ${tempFiltersPath}`);
            
            // Override the --filters-file arg
            step.args['filters-file'] = tempFiltersPath;
          } catch (err) {
            logger.error(`[amazon] Failed to synthesize filters for ${step.toolId}:`, err);
          }
        }
      }

      const tools = scanTools();
      await workflowRunner?.run(workflow, tools);
      return { success: true };
      } finally {
        runner?.off('progress', onProgress);
        runner?.off('intervention', onIntervention);
      }
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('amazon:stopWorkflow', async () => {
    workflowRunner?.stop();
    return { success: true };
  });

  // ── Workflow Store IPCs ───────────────────────────────────────────────────
  ipcMain.handle('amazon:listWorkflows', async () => {
    return await amazonWorkflowStore.getWorkflows();
  });

  ipcMain.handle('amazon:saveWorkflow', async (_, workflow: Workflow) => {
    await amazonWorkflowStore.saveWorkflow(workflow);
    return { success: true };
  });

  ipcMain.handle('amazon:removeWorkflow', async (_, id: string) => {
    await amazonWorkflowStore.removeWorkflow(id);
    return { success: true };
  });

  // ── Pipeline Resume / Session File / Stats ──────────────────────────────

  ipcMain.handle('amazon:resumeWorkflow', async (event) => {
    try {
      if (!workflowRunner?.isPaused()) {
        return { success: false, error: 'No paused workflow to resume' };
      }

      // Re-attach progress listeners
      const onProgress = (data: any) => {
        event.sender.send('amazon:workflowProgress', data);
      };
      const onIntervention = (data: any) => {
        event.sender.send('amazon:workflowIntervention', data);
      };

      runner?.on('progress', onProgress);
      runner?.on('intervention', onIntervention);

      try {
        await workflowRunner.resume();
        return { success: true };
      } finally {
        runner?.off('progress', onProgress);
        runner?.off('intervention', onIntervention);
      }
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('amazon:readSessionFile', async (_, sessionName: string, fileName: string) => {
    try {
      const sessionsBase = join('d:\\Code\\amazon\\.agent\\skills', 'report', 'sessions');
      const filePath = join(sessionsBase, sessionName, fileName);

      // Security: ensure the resolved path is within the sessions directory
      const resolved = require('node:path').resolve(filePath);
      const base = require('node:path').resolve(sessionsBase);
      if (!resolved.startsWith(base)) {
        return { success: false, error: 'Path traversal not allowed' };
      }

      if (!existsSync(filePath)) {
        return { success: false, error: `File not found: ${fileName}` };
      }

      const content = await readFile(filePath, 'utf-8');
      return { success: true, content, filePath: resolved };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('amazon:getSessionStats', async (_, sessionName: string) => {
    try {
      const sessionsBase = join('d:\\Code\\amazon\\.agent\\skills', 'report', 'sessions');
      const sessionDir = join(sessionsBase, sessionName);

      if (!existsSync(sessionDir)) {
        return { success: true, stats: {} };
      }

      // Try pipeline_stats.json first
      const statsPath = join(sessionDir, 'pipeline_stats.json');
      if (existsSync(statsPath)) {
        const raw = await readFile(statsPath, 'utf-8');
        return { success: true, stats: JSON.parse(raw) };
      }

      // Fallback: count lines in known CSV files
      const csvFiles = [
        { phase: 1, file: 'product_base.csv', label: '搜索采样' },
        { phase: 2, file: 'product_small_seller.csv', label: '卖家筛选' },
        { phase: 3, file: 'product_store_ok.csv', label: '店铺筛选' },
        { phase: 4, file: 'product_potential.csv', label: '产品详情' },
        { phase: 5, file: 'product_keyword_ok.csv', label: '关键词分析' },
      ];

      const stats: Record<string, { count: number; label: string }> = {};
      for (const csv of csvFiles) {
        const csvPath = join(sessionDir, csv.file);
        if (existsSync(csvPath)) {
          const content = await readFile(csvPath, 'utf-8');
          const lines = content.trim().split('\n');
          // Subtract 1 for header
          stats[`phase${csv.phase}`] = { count: Math.max(0, lines.length - 1), label: csv.label };
        }
      }

      return { success: true, stats };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // ── Scheduler ────────────────────────────────────────────────────────────
  try {
    if (scheduler && typeof scheduler.start === 'function') {
      scheduler.start();
    }
  } catch (err) {
    logger.error(`[amazon] Failed to start scheduler: ${err}`);
  }
  console.log('>>> [amazon] HANDLERS REGISTERED SUCCESSFULLY');
}
