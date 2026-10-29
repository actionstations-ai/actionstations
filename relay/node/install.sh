#!/usr/bin/env bash
# Installs the Action Stations relay on a Linux host with systemd (spec 0409 FR-9c).
#   sudo ./install.sh ./actionstations-relay-linux-x64
# Copies the executable to /usr/local/bin, writes a config file if none exists, installs and
# starts the unit, and shows the server key and certificate fingerprint from the first start.
set -euo pipefail
BIN="${1:-}"
if [[ -z "$BIN" || ! -f "$BIN" ]]; then
  echo "usage: sudo $0 <actionstations-relay-linux-x64>" >&2
  exit 2
fi
if [[ "$(id -u)" != 0 ]]; then echo "run as root (sudo)" >&2; exit 2; fi
install -m 0755 "$BIN" /usr/local/bin/actionstations-relay
install -d -m 0750 /etc/actionstations-relay
if [[ ! -f /etc/actionstations-relay/config.toml ]]; then
  cat > /etc/actionstations-relay/config.toml <<'EOF'
port = 8485
bind = "0.0.0.0"
data-dir = "/var/lib/actionstations-relay"
tls = "self-signed"
retention-hours = 72
max-sessions = 20
max-clients = 60
allow = []
blobs = "db"
log-level = "info"
EOF
  echo "wrote /etc/actionstations-relay/config.toml (edit host and allow for your network)"
fi
# The unit text comes from the program itself, so it matches this version.
AS_RELAY_DATA_DIR=/var/lib/actionstations-relay /usr/local/bin/actionstations-relay service install --dry-run >/dev/null
/usr/local/bin/actionstations-relay service install
sleep 2
systemctl --no-pager --lines=20 status actionstations-relay || true
echo
echo "First-start output (server key, certificate fingerprint):"
journalctl -u actionstations-relay --no-pager -n 20 | grep -E "Server key|fingerprint|Listening" || true
