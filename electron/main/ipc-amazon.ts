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

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerAmazonHandlers(gatewayManager: GatewayManager): void {

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
    return dialog.showOpenDialog({
      title: '选择 Skill 目录',
      properties: ['openDirectory'],
      buttonLabel: '选择',
    })
  })

  /**
   * Read and parse SKILL.md from a given directory path.
   * Returns SkillMeta or an error.
   */
  ipcMain.handle('amazon:readSkillMeta', async (_, dirPath: string) => {
    try {
      const skillMdPath = join(dirPath, 'SKILL.md')
      if (!existsSync(skillMdPath)) {
        return { success: false, error: '目录中未找到 SKILL.md 文件' }
      }
      const content = await readFile(skillMdPath, 'utf-8')
      const slug = basename(dirPath)
      const meta = parseSkillMd(content, slug)
      return { success: true, meta }
    } catch (err) {
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
    try {
      const skillMdPath = join(srcPath, 'SKILL.md')
      if (!existsSync(skillMdPath)) {
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
        await rm(destPath, { recursive: true, force: true })
      }

      // Copy entire skill directory
      await cp(srcPath, destPath, { recursive: true })

      logger.info(`[amazon] Installed skill "${meta.slug}" from ${srcPath}`)
      gatewayManager.debouncedReload()

      return { success: true, slug: meta.slug, meta }
    } catch (err) {
      logger.error('[amazon] installSkillFromPath failed:', err)
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
      const { canceled, filePath } = await dialog.showSaveDialog({
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
      const { canceled, filePath } = await dialog.showSaveDialog({
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
  ipcMain.handle('amazon:exportPdf', async (event, defaultName: string) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return { success: false, error: '无法获取当前窗口' }

      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: '导出 PDF',
        defaultPath: defaultName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
        buttonLabel: '导出',
      })
      if (canceled || !filePath) return { success: false, canceled: true }

      const pdfData = await win.webContents.printToPDF({
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
      const { canceled, filePaths } = await dialog.showOpenDialog({
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
}
