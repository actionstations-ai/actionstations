/** Entry point of the bundle and the executable: arguments in, exit code out. */
import { main } from './cli'

void main(process.argv.slice(2), {
  stdout: (line) => process.stdout.write(line + '\n'),
  stderr: (line) => process.stderr.write(line + '\n'),
  env: process.env,
  platform: process.platform,
}).then((code) => {
  process.exitCode = code
})
