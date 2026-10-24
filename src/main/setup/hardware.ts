// What this machine can run (ADR-0021): RAM, platform, Apple Silicon, and NVIDIA VRAM when
// nvidia-smi is installed. Read only when the setup screen asks; nothing leaves the machine.
import { arch as osArch, platform as osPlatform, totalmem } from 'node:os'
import type { HardwareView } from '@shared/schemas/setup'
import { runCommand, type Runner } from './run'

export interface HardwareInput {
  platform: NodeJS.Platform
  arch: string
  ramBytes: number
  vramBytes?: number
  gpuName?: string
}

const MIB = 1024 * 1024

/** "NVIDIA GeForce RTX 4090, 24564" lines → the largest card. */
export function parseNvidiaSmi(stdout: string): { name: string; vramBytes: number } | undefined {
  let best: { name: string; vramBytes: number } | undefined
  for (const line of stdout.split('\n')) {
    const [name, mib] = line.split(',').map((s) => s.trim())
    const n = Number(mib)
    if (!name || !Number.isFinite(n) || n <= 0) continue
    if (!best || n * MIB > best.vramBytes) best = { name, vramBytes: n * MIB }
  }
  return best
}

/** The memory a local model may use: unified memory on Apple Silicon, VRAM, else half of RAM. */
export function hardwareView(h: HardwareInput): HardwareView {
  const appleSilicon = h.platform === 'darwin' && h.arch === 'arm64'
  const gpu = appleSilicon || (h.vramBytes ?? 0) > 0
  const budgetBytes = appleSilicon
    ? Math.floor(h.ramBytes * 0.7)
    : h.vramBytes && h.vramBytes > 0
      ? h.vramBytes
      : Math.floor(h.ramBytes * 0.5)
  return {
    platform: h.platform,
    arch: h.arch,
    appleSilicon,
    ramBytes: h.ramBytes,
    ...(h.vramBytes ? { vramBytes: h.vramBytes } : {}),
    ...(h.gpuName ? { gpuName: h.gpuName } : {}),
    budgetBytes,
    gpu,
  }
}

/** Read this machine. nvidia-smi is optional: absent or failing means "no NVIDIA GPU". */
export async function readHardware(run: Runner = runCommand): Promise<HardwareInput> {
  const platform = osPlatform()
  const base: HardwareInput = { platform, arch: osArch(), ramBytes: totalmem() }
  if (platform === 'darwin') return base
  try {
    const res = await run(
      'nvidia-smi',
      ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
      { timeoutMs: 3000 },
    )
    const gpu = res.code === 0 ? parseNvidiaSmi(res.stdout) : undefined
    return gpu ? { ...base, vramBytes: gpu.vramBytes, gpuName: gpu.name } : base
  } catch {
    return base
  }
}
