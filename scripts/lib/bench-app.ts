// What the benchmark scripts (#434, scripts/bench/) take from the app's source: the zod schemas
// of the run and report files, the memory tiers of the setup recommendations, the hardware
// reading and budget. Bundled for plain Node by
// scripts/lib/bundle-main.mjs (importMain('bench-app', 'scripts/lib/bench-app.ts')); nothing
// here ships in the app.
export {
  BenchReport,
  BenchRun,
  benchReportJsonSchema,
  BENCH_FORMAT_VERSION,
} from '../../src/shared/schemas/bench'
export { TEXT_TIERS } from '../../src/main/setup/models'
export { hardwareView, readHardware } from '../../src/main/setup/hardware'
