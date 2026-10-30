# Self-hosted live play server

A server your organization installs on its own network so live exercises run with no internet and no third party. It is the same server logic as the Action Stations relay and the facilitator's laptop, on Node with a SQLite file, and it is the only thing the facilitator's app and the players' devices need to reach.

This page is for the IT administrator who installs it. The facilitator side (choosing **Your server** in the Live tab) is in [Live play](live-play.md).

## What it does and does not do

- Carries encrypted messages between the facilitator's app and the players' phones, tablets and laptops, across rooms and network segments, for several sessions at once.
- Stores only ciphertext, for at most 72 hours, and deletes it when the facilitator ends the session.
- Makes no outbound connection: no update check, no telemetry, no DNS lookups, no HTTP client in the program.
- Cannot read exercise content. The keys travel only in the invite links; the server holds none.

## Requirements

- One machine on the network every room can reach: 2 vCPU and 2 GB of memory handle 20 sessions of 60 devices.
- One TCP port (8485 by default) open from the players' networks to the server.
- Windows Server 2019 or later, Windows 10 or later; Linux x64 with glibc 2.31 or later; or Docker 24 or later. macOS: run `node dist/server.cjs`; the facilitator's own Mac uses **This computer** instead.

## Install

### Docker

The published image runs on x86-64 (amd64) and ARM (arm64) hosts, such as AWS Graviton or a Raspberry Pi 4 or 5: `docker pull ghcr.io/actionstations-ai/actionstations-relay:<version>`. To build it yourself instead, from a checkout of the repository (building takes a couple of minutes):

```
docker compose -f relay/node/compose.yaml up -d
docker compose -f relay/node/compose.yaml logs
```

The first start prints the server URL, the certificate fingerprint and the server key. The compose file runs the container as a non-root user with a read-only root filesystem, no capabilities and one volume, `relay-data`, for the database, certificate and logs. To have Docker enforce that the server makes no outbound connection, put it on an `internal: true` network and publish the port through a proxy on the host.

### Linux (systemd)

```
sudo ./relay/node/install.sh ./actionstations-relay-linux-x64
```

This copies the program to `/usr/local/bin`, writes `/etc/actionstations-relay/config.toml` if none exists and installs and starts `actionstations-relay.service`. The unit runs with a dynamic user, a read-only system and no capabilities. `actionstations-relay service install --dry-run` prints what it would do. The unit file carries a commented `IPAddressDeny=any` and `IPAddressAllow=` example: with your own ranges listed, the kernel itself refuses any other address, outbound included.

### Windows

Run an elevated prompt:

```
actionstations-relay-win-x64.exe service install
```

This writes `%ProgramData%\ActionStationsRelay\config.toml` if none exists, creates a task named `ActionStationsRelay` that starts the server at boot as LocalService, gives LocalService write access to the data directory, adds a Windows Defender Firewall rule for the port (domain and private networks only) and starts it. Each command is printed as it runs. `service uninstall` reverses it.

The task has no console, so the server key it creates on first start is not shown anywhere. From the same prompt run `actionstations-relay-win-x64.exe rotate-key --data-dir "%ProgramData%\ActionStationsRelay"` to get a key. The generated `config.toml` lists no `host`; set one for the names players use, then restart the task. To check a finished install from another machine: `AS_RELAY_KEY=<key> node relay/node/scripts/smoke.mjs https://<host>:8485` (health, player page, create a session, WebSocket join).

The program is a console program, not a Windows service binary, so it runs as a startup task. If your policy requires a real service, wrap it with a service host your organization already approves.

### Running it directly

```
actionstations-relay serve --host ttx.internal --tls self-signed
```

## First start

The first start prints three things, once:

1. The URL or URLs, from `host` and `port`.
2. With a self-signed certificate, its SHA-256 fingerprint.
3. The **server key**, a random secret the facilitator's app sends to create sessions. Only its hash is stored. `actionstations-relay rotate-key` prints a new one and the old one stops working at once. Players never need it.

Give the facilitator the URL, the key, and (for a self-signed certificate) the fingerprint to compare when the app shows it.

## Settings

Settings come from a TOML file (`<data-dir>/config.toml`, or `--config FILE`), then `AS_RELAY_*` environment variables, then flags; later wins. `actionstations-relay print-config` shows the effective values without the key. The commented file is `relay/node/actionstations-relay.toml.example`.

| Setting (flag, environment)                    | Default                                                     | Meaning                                                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `port` (`--port`, `AS_RELAY_PORT`)             | 8485                                                        | The one TCP port.                                                                                              |
| `bind` (`--bind`)                              | `0.0.0.0`                                                   | One address, or all.                                                                                           |
| `host` (`--host`, repeat; `AS_RELAY_HOST`)     | none                                                        | Names and addresses for the certificate and the printed URLs.                                                  |
| `tls` (`--tls`, `AS_RELAY_TLS`)                | required                                                    | `self-signed`, or `cert.pem,key.pem`. Plain HTTP needs `--insecure-http` and prints a warning.                 |
| `data-dir` (`--data-dir`, `AS_RELAY_DATA_DIR`) | `/var/lib/actionstations-relay`, `%ProgramData%\...`        | Database, certificate, key hash, logs.                                                                         |
| `retention-hours` (`--retention-hours`)        | 72                                                          | Sessions are deleted this long after they start. Above 72 is refused.                                          |
| `max-sessions`, `max-clients`                  | 20, 60                                                      | Live sessions, and devices per session.                                                                        |
| `allow` (`--allow`, list of CIDR ranges)       | empty (any)                                                 | Connections from other addresses are closed before TLS.                                                        |
| `blobs` (`--blobs`)                            | `db`                                                        | `disk` keeps media chunks as files under `<data-dir>/blobs`.                                                   |
| `log-dir`, `log-level` (`info` or `warn`)      | `<data-dir>/logs`, `info`                                   | There is no level that prints messages.                                                                        |
| `[limits]` (`--limit name=value`)              | 256 KiB message, 64 MiB media file, 1 GiB media per session | `envelope-bytes` (max 4 MiB), `blob-bytes` (1 GiB), `blobs-total-bytes` (8 GiB), `stored-envelopes` (200,000). |

## Certificates

- **The organization's certificate.** `tls = "cert.pem,key.pem"`. Phones that trust your CA show no warning. This is the recommended choice.
- **Self-signed.** The server makes an ECDSA P-256 certificate on first start, keeps it in the data directory, and reports its fingerprint in the log and at `/v1/health`. The facilitator's app shows the fingerprint once, asks to confirm it with you, and pins it; if the certificate ever changes the app stops with "The server's certificate changed. Confirm the new fingerprint with your IT team before continuing." Players' browsers cannot pin: each phone shows its warning once. Safari refuses WebSockets to an untrusted certificate, so the page falls back to a slower transport that works. A mobile device management trust profile removes the warnings.
- **Behind a reverse proxy.** `--insecure-http` behind a proxy that terminates TLS. The proxy must pass WebSocket upgrades and server-sent events without buffering.

## Network

- Every room must reach the server's address and port. Use `host` names that resolve on every segment.
- Open only that TCP port. Nothing else is needed, in either direction.
- `allow` is the recommended restriction: list your internal ranges.

## Logs and status

`connections.log` has one JSON line per event: time, event, session id, remote address, client id, close code. `server.log` has startup, settings and errors. Both rotate at 10 MB, five files. A message, token or key is never written, and the program refuses to write a record that carries one.

`actionstations-relay status` prints the sessions, devices, storage use and uptime from the running server over a local socket.

## Upgrading and uninstalling

Replace the program and restart; the database carries a schema version and a newer database is refused by an older program. To remove it, run `service uninstall` (or `docker compose down -v`) and delete the data directory.

## Troubleshooting

- **A phone cannot connect.** Check the phone can reach the address and port (same VPN or segment), that `allow` includes it, and that the firewall rule exists. The connection log shows refusals by address, at most one line a minute per address.
- **Certificate warning on every phone.** Expected with a self-signed certificate; use your own CA or a trust profile.
- **Safari connects but is slow.** It is using the fallback transport; the exercise works.
- **"A server key is required".** The app has no key or an old one; run `rotate-key` and enter the new one.
- **"This server has reached its session limit".** Raise `max-sessions` or end old sessions; ended sessions free their slot at once.

## Security statement for a change request

- The server stores and forwards ciphertext. It holds no key and cannot read messages, media, names or roles. It sees session ids, times, device ids, message types and sizes, and addresses.
- Data is kept for at most 72 hours and deleted when the session ends. The data directory is the only place it writes.
- No outbound connections: the program has no HTTP client, DNS or update code; its test suite runs a whole session with every outbound call replaced by a recorder; the systemd unit and a Docker internal network can deny egress in the operating system.
- Session creation needs the server key; joining needs the session's join token; both are compared in constant time and never appear in a URL or a log.
- It runs as LocalService, a dynamic user, or uid 10001, on a port above 1024.
- To verify: run `strings` on `relay.sqlite` after a session and find no exercise text; list the process's sockets and find only the listening port and connected devices.

## Publishing the container image (maintainers)

A tag push (`vX.Y.Z`) publishes the image for amd64 and arm64 from the release workflow's `relay-image` job, using the workflow token on a standard runner (public packages cost nothing). To publish by hand instead, from the repository root and logged in with `docker login ghcr.io`:

```
docker buildx build --platform linux/amd64,linux/arm64 -f relay/node/Dockerfile \
  -t ghcr.io/actionstations-ai/actionstations-relay:<version> --push .
```

After the first publish, set the package's visibility to public once in the organization's package settings. Binaries: the release workflow builds the Linux x64 and Windows x64 executables (`pnpm build:player`, then `pnpm --filter @actionstations/relay-node build:public` and `build:sea`) on standard runners and uploads each with its `.sha256` file to the draft release. To build one by hand, run the same three commands on that platform.
