// Pinned vendor data for the local tools (ADR-0021, #334): where the official installers are,
// which hosts a download may pass through, and who must have signed them. Every value was
// measured on 2026-10-24; see the ADR's research table. A vendor that moves hosts or changes
// its signing identity makes installs fail until this file is updated: the user still has
// "Open the download page".
import type { ToolId } from '@shared/schemas/setup'

export type PlatformKey = `${NodeJS.Platform}-${string}`

export interface InstallerSource {
  format: 'dmg' | 'exe'
  /** The vendor's stable "latest" URL (or the release API for Ollama, see `githubAsset`). */
  url: string
  /** Hard cap on the bytes received. */
  maxBytes: number
  /** Shown in the row: "571 MB download · about 700 MB on disk". */
  sizeLabel: string
  /** Read the asset's URL and sha256 digest from the GitHub releases API instead of `url`. */
  githubAsset?: { repo: string; name: string }
}

export interface ToolIdentity {
  /** macOS Developer ID Team ID that must sign the .app. */
  macTeamId: string
  /** The certificate's name, for messages. */
  macTeamName: string
  /** Windows Authenticode signer subject CN. */
  winSubjectCn: string
}

export interface ToolDef {
  id: ToolId
  name: string
  purpose: string
  license: string
  licenseUrl: string
  downloadPage: string
  /** Hosts every redirect hop must be on (https only). */
  hosts: string[]
  identity?: ToolIdentity
  sources: Partial<Record<PlatformKey, InstallerSource>>
  /** macOS app bundle names to look for in /Applications and ~/Applications. */
  macApps: string[]
  /** Why there is no one-click install on platforms without a source. */
  pageReason: Partial<Record<NodeJS.Platform, string>>
  /** Platforms the vendor does not support at all. */
  unsupported?: (key: PlatformKey) => string | undefined
}

const MB = 1024 * 1024
const GB = 1024 * MB

const LINUX_PAGE =
  'On Linux the vendor publishes no signed installer and no checksum to verify, so Action Stations does not install it for you.'

export const TOOLS: Record<ToolId, ToolDef> = {
  lmstudio: {
    id: 'lmstudio',
    name: 'LM Studio',
    purpose: 'Runs text and embedding models on this computer, with its own model browser.',
    license: 'LM Studio terms (free for personal and internal business use; not open source)',
    licenseUrl: 'https://lmstudio.ai/app-terms',
    downloadPage: 'https://lmstudio.ai/download',
    hosts: ['lmstudio.ai', 'installers.lmstudio.ai'],
    identity: {
      macTeamId: 'D65G88RHWN',
      macTeamName: 'Element Labs Inc',
      winSubjectCn: 'Element Labs Inc.',
    },
    sources: {
      'darwin-arm64': {
        format: 'dmg',
        url: 'https://lmstudio.ai/download/latest/darwin/arm64',
        maxBytes: 1.5 * GB,
        sizeLabel: '571 MB download · about 700 MB on disk',
      },
      'win32-x64': {
        format: 'exe',
        url: 'https://lmstudio.ai/download/latest/win32/x64',
        maxBytes: 1.5 * GB,
        sizeLabel: '619 MB download · about 800 MB on disk',
      },
      'win32-arm64': {
        format: 'exe',
        url: 'https://lmstudio.ai/download/latest/win32/arm64',
        maxBytes: 1.5 * GB,
        sizeLabel: 'about 620 MB download · about 800 MB on disk',
      },
    },
    macApps: ['LM Studio.app'],
    pageReason: {
      linux: `${LINUX_PAGE} LM Studio ships an AppImage (1.0 GB).`,
    },
    unsupported: (key) =>
      key === 'darwin-x64' ? 'LM Studio needs a Mac with Apple Silicon.' : undefined,
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    purpose: 'Runs text and embedding models on this computer from the command line or its app.',
    license: 'MIT',
    licenseUrl: 'https://github.com/ollama/ollama/blob/main/LICENSE',
    downloadPage: 'https://ollama.com/download',
    hosts: [
      'ollama.com',
      'api.github.com',
      'github.com',
      'release-assets.githubusercontent.com',
      'objects.githubusercontent.com',
    ],
    identity: {
      // Ollama's macOS certificate still carries the company's earlier name.
      macTeamId: '3MU9H2V9Y9',
      macTeamName: 'Infra Technologies, Inc',
      winSubjectCn: 'Ollama Inc.',
    },
    sources: {
      'darwin-arm64': {
        format: 'dmg',
        url: 'https://api.github.com/repos/ollama/ollama/releases/latest',
        githubAsset: { repo: 'ollama/ollama', name: 'Ollama.dmg' },
        maxBytes: 1 * GB,
        sizeLabel: '221 MB download · about 670 MB on disk',
      },
      'darwin-x64': {
        format: 'dmg',
        url: 'https://api.github.com/repos/ollama/ollama/releases/latest',
        githubAsset: { repo: 'ollama/ollama', name: 'Ollama.dmg' },
        maxBytes: 1 * GB,
        sizeLabel: '221 MB download · about 670 MB on disk',
      },
      'win32-x64': {
        format: 'exe',
        url: 'https://api.github.com/repos/ollama/ollama/releases/latest',
        githubAsset: { repo: 'ollama/ollama', name: 'OllamaSetup.exe' },
        maxBytes: 3 * GB,
        sizeLabel: '1.7 GB download · at least 4 GB on disk',
      },
    },
    macApps: ['Ollama.app'],
    pageReason: {
      linux: `Ollama's Linux install extracts into /usr with sudo or pipes a script into a shell; Action Stations does neither.`,
      win32: 'Ollama publishes no Windows installer for this processor; use the download page.',
    },
  },
  comfyui: {
    id: 'comfyui',
    name: 'ComfyUI',
    purpose: 'Generates scene images and short video clips for injects from ComfyUI workflows.',
    license: 'ComfyUI Desktop: AGPL-3.0 (ComfyUI: GPL-3.0)',
    licenseUrl: 'https://github.com/Comfy-Org/Comfy-Desktop',
    downloadPage: 'https://www.comfy.org/download',
    hosts: ['download.comfy.org', 'dl.todesktop.com'],
    identity: {
      // Comfy Org signs as its legal entity.
      macTeamId: '6FXBT88W8J',
      macTeamName: 'Drip Artificial Inc',
      winSubjectCn: 'Drip Artificial Inc',
    },
    sources: {
      'darwin-arm64': {
        format: 'dmg',
        url: 'https://download.comfy.org/mac/dmg/arm64',
        maxBytes: 1 * GB,
        sizeLabel: '196 MB download · about 5 GB on disk with its Python environment',
      },
      'win32-x64': {
        format: 'exe',
        url: 'https://download.comfy.org/windows/nsis/x64',
        maxBytes: 1 * GB,
        sizeLabel: '181 MB download · about 5 GB on disk with its Python environment',
      },
    },
    macApps: ['Comfy Desktop.app', 'ComfyUI.app'],
    pageReason: {
      linux: `${LINUX_PAGE} ComfyUI Desktop ships an AppImage.`,
      win32:
        'ComfyUI Desktop has no one-click install for this processor here; use the download page.',
    },
    unsupported: (key) =>
      key === 'darwin-x64' ? 'ComfyUI Desktop needs a Mac with Apple Silicon.' : undefined,
  },
  voice: {
    id: 'voice',
    name: 'Local voice (mlx-audio)',
    purpose: 'Speaks radio calls, voicemails and PA announcements on this computer.',
    license: 'MIT',
    licenseUrl: 'https://github.com/Blaizzy/mlx-audio/blob/main/LICENSE',
    downloadPage: 'https://github.com/Blaizzy/mlx-audio',
    hosts: [],
    sources: {},
    macApps: [],
    pageReason: {},
    unsupported: (key) =>
      key === 'darwin-arm64'
        ? undefined
        : 'mlx-audio runs on Apple Silicon only. Use the system voice or a cloud voice instead.',
  },
}

export const TOOL_ORDER: ToolId[] = ['lmstudio', 'ollama', 'comfyui', 'voice']

/** mlx-audio has no signed installer: the row shows this command for the user to run. */
export const VOICE_INSTALL_COMMAND = 'uv tool install mlx-audio'
export const VOICE_SIZE_LABEL =
  'about 1 GB with its Python packages, plus voice models on first use'
export const VOICE_PORT = 8765
export const VOICE_START_ARGS = ['--host', '127.0.0.1', '--port', String(VOICE_PORT)]

export const platformKey = (platform: NodeJS.Platform, arch: string): PlatformKey =>
  `${platform}-${arch}`

/** Hosts for model files fetched into ComfyUI's folders (Hugging Face and its CDN). */
export const MODEL_HOSTS = ['huggingface.co', '.hf.co']
