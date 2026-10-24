// Stands in for the `electron` module when the pack reader runs under plain Node
// (scripts/pack-validate.mjs). The reader never needs Electron: resources come from
// TTX_RESOURCES, which the script points at the checkout. Any call that does reach Electron
// fails loudly instead of returning a wrong path.
const unavailable = (what) => () => {
  throw new Error(`${what} is not available in pack-validate (plain Node)`)
}

export const app = {
  isPackaged: false,
  getAppPath: unavailable('app.getAppPath'),
  getPath: unavailable('app.getPath'),
  getVersion: unavailable('app.getVersion'),
}
export const BrowserWindow = { getAllWindows: () => [] }
export default { app, BrowserWindow }
