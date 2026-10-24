// Local tools setup (ADR-0021, #334): the status the setup screens show.
import type { SetupStatus } from '@shared/schemas/setup'
import { defaultEnv, detectTools, type SetupEnv } from './detect'
import { hardwareView, readHardware, type HardwareInput } from './hardware'
import { installedModels, recommendModels } from './models'

export interface StatusDeps {
  env?: SetupEnv
  hardware?: () => Promise<HardwareInput>
}

/** Tools with their states, this machine's hardware, and the models to offer. */
export async function setupStatus(deps: StatusDeps = {}): Promise<SetupStatus> {
  const env = deps.env ?? defaultEnv()
  const [{ tools, running }, hw] = await Promise.all([
    detectTools(env),
    (deps.hardware ?? readHardware)(),
  ])
  const hardware = hardwareView(hw)
  const have = await installedModels(running, env.fetchImpl)
  return { hardware, tools, models: recommendModels(hardware, have) }
}

export { defaultEnv } from './detect'
