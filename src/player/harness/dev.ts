/**
 * `pnpm dev:player`: a scripted session on loopback with the default seats. Prints the players
 * and staff links and a few curl lines for the facilitator actions. Built and run by
 * scripts/player-dev.mjs; stops on Ctrl-C and closes every connection.
 */
import { createWebCryptoProvider } from '../../shared/live/crypto/webcrypto'
import { HarnessController } from './controller'
import { startHarness } from './server'

async function main(): Promise<void> {
  const port = Number(process.env.PLAYER_PORT ?? 8485)
  const controller = await HarnessController.create({
    crypto: createWebCryptoProvider(),
    scenarioTitle: 'Flight to Nowhere',
    sessionName: 'Dev session',
    attribution: 'role',
  })
  const harness = await startHarness({
    controller,
    port,
    websocket: process.env.PLAYER_NO_WS !== '1',
    log: process.env.PLAYER_LOG === '1' ? (l) => console.log(l) : undefined,
  })
  const h = `${harness.url}/__harness`
  console.log(`Player page harness on ${harness.url}`)
  console.log(`  players link: ${harness.invite('players')}`)
  console.log(`  staff link:   ${harness.invite('staff')}`)
  console.log(`  Ops card:     ${harness.invite('players', 'ops-director')}`)
  console.log('')
  console.log('Facilitator actions:')
  console.log(
    `  curl -X POST ${h}/notice  -d '{"text":"Hot wash in 10 minutes","level":"warning"}'`,
  )
  console.log(
    `  curl -X POST ${h}/release -d '{"title":"FIDS boards dark","body":"All boards in Terminal B show no data.","targets":["role:ops-director"],"exerciseTime":"0:45"}'`,
  )
  console.log(
    `  curl -X POST ${h}/clock   -d '{"clock":{"elapsedMin":0,"runningSince":${Date.now()},"rate":1,"reason":"start"}}'`,
  )
  console.log(`  curl -X POST ${h}/burst   -d '{"count":500}'`)
  console.log(`  curl -X POST ${h}/reseat  -d '{"clientId":"<id>","roleId":"pio"}'`)
  console.log(`  curl -X POST ${h}/kick    -d '{"clientId":"<id>"}'`)
  console.log(`  curl -X POST ${h}/end     -d '{"reason":"endex","message":"Thank you all."}'`)
  console.log(`  curl ${h}/state`)
  const stop = () => {
    void harness.close().then(() => process.exit(0))
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

void main()
