#!/bin/bash
# Runs ON THE SERVER, as root, uploaded and started by deploy/attest.sh (or attest.ps1). Safe to run again.
# Installs Node, the attestation server as a locked-down systemd service under its own user, its signing key (made
# here, never copied anywhere), and the /api route in Caddy.
#   bash attest-setup.sh [HALL_ADDRESS] [MEZO_HALL_ADDRESS]
set -euo pipefail
HALL_ADDRESS="${1:-}"
MEZO_HALL_ADDRESS="${2:-}"
export DEBIAN_FRONTEND=noninteractive

# A fresh server is still running server-setup.sh (cloud-init) for a few minutes: wait for it, so apt is free and
# Caddy is installed before the /api route is added.
if command -v cloud-init >/dev/null 2>&1; then
	echo "Waiting for the server's first-boot setup to finish..."
	cloud-init status --wait >/dev/null 2>&1 || true
fi
if [ ! -f /etc/caddy/Caddyfile ]; then
	echo "Caddy is not installed: run deploy/server-setup.sh on this server first." >&2
	exit 1
fi

# Node 18 or newer. Ubuntu 24.04's own package is 18.
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
	apt-get update
	apt-get install -y nodejs
fi

id emberdeep-attest >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin emberdeep-attest
install -d -m 755 /opt/emberdeep-attest
install -m 644 /tmp/emberdeep-attest.mjs /opt/emberdeep-attest/attest.mjs
install -d -m 750 -o root -g emberdeep-attest /etc/emberdeep

# The signing key is made once, on this server, readable only by the service user.
if [ ! -f /etc/emberdeep/signer.key ]; then
	SIGNER_KEY_FILE=/etc/emberdeep/signer.key node /opt/emberdeep-attest/attest.mjs keygen /etc/emberdeep/signer.key >/dev/null
	chown emberdeep-attest:emberdeep-attest /etc/emberdeep/signer.key
	chmod 400 /etc/emberdeep/signer.key
fi
SIGNER="$(runuser -u emberdeep-attest -- node /opt/emberdeep-attest/attest.mjs address /etc/emberdeep/signer.key)"

# The relayer key pays the gas for records on Mezo Testnet. It is separate from the signing key and only ever needs a
# little testnet BTC; fund its address from the Mezo faucet.
if [ ! -f /etc/emberdeep/relayer.key ]; then
	node /opt/emberdeep-attest/attest.mjs keygen /etc/emberdeep/relayer.key >/dev/null
	chown emberdeep-attest:emberdeep-attest /etc/emberdeep/relayer.key
	chmod 400 /etc/emberdeep/relayer.key
fi
RELAYER="$(runuser -u emberdeep-attest -- node /opt/emberdeep-attest/attest.mjs address /etc/emberdeep/relayer.key)"

# Settings. The Hall address is kept from an earlier run unless a new one is given. Without any, the server signs for
# Mezo only (its contracts come with the build).
if [ -z "$HALL_ADDRESS" ] && [ ! -f /etc/emberdeep/attest.env ]; then
	cat > /etc/emberdeep/attest.env <<ENV
SIGNER_KEY_FILE=/etc/emberdeep/signer.key
PORT=8787
HOST=127.0.0.1
ENV
	chmod 640 /etc/emberdeep/attest.env
	chgrp emberdeep-attest /etc/emberdeep/attest.env
fi
if [ -n "$HALL_ADDRESS" ]; then
	if ! [[ "$HALL_ADDRESS" =~ ^0x[0-9a-fA-F]{40}$ ]]; then echo "Not an address: $HALL_ADDRESS" >&2; exit 1; fi
	cat > /etc/emberdeep/attest.env <<ENV
HALL_ADDRESS=${HALL_ADDRESS}
HALL_CHAIN_ID=5042
SIGNER_KEY_FILE=/etc/emberdeep/signer.key
PORT=8787
HOST=127.0.0.1
ENV
	chmod 640 /etc/emberdeep/attest.env
	chgrp emberdeep-attest /etc/emberdeep/attest.env
fi

# Mezo Testnet: the pot and the Hall come with the build; a second argument overrides the Hall on Mezo.
if [ -f /etc/emberdeep/attest.env ]; then
	sed -i '/^MEZO_POT_ADDRESS=/d' /etc/emberdeep/attest.env
	if ! grep -q '^RELAYER_KEY_FILE=' /etc/emberdeep/attest.env; then
		echo "RELAYER_KEY_FILE=/etc/emberdeep/relayer.key" >> /etc/emberdeep/attest.env
	fi
	if [ -n "$MEZO_HALL_ADDRESS" ]; then
		if ! [[ "$MEZO_HALL_ADDRESS" =~ ^0x[0-9a-fA-F]{40}$ ]]; then echo "Not an address: $MEZO_HALL_ADDRESS" >&2; exit 1; fi
		sed -i '/^MEZO_HALL_ADDRESS=/d' /etc/emberdeep/attest.env
		echo "MEZO_HALL_ADDRESS=${MEZO_HALL_ADDRESS}" >> /etc/emberdeep/attest.env
	fi
fi

cat > /etc/systemd/system/emberdeep-attest.service <<'UNIT'
[Unit]
Description=Emberdeep attestation server (replays descents and signs them for the Hall on Arc)
After=network-online.target
Wants=network-online.target

[Service]
User=emberdeep-attest
Group=emberdeep-attest
EnvironmentFile=/etc/emberdeep/attest.env
ExecStart=/usr/bin/env node /opt/emberdeep-attest/attest.mjs
Restart=on-failure
RestartSec=3
MemoryMax=512M
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
CapabilityBoundingSet=
AmbientCapabilities=

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload

# Caddy: send /api/* to the service, with a size cap on what it accepts. Added once, before the file server.
if ! grep -q "reverse_proxy 127.0.0.1:8787" /etc/caddy/Caddyfile; then
	cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.before-attest
	awk '
		/^[[:space:]]*file_server[[:space:]]*$/ && !done {
			print "\thandle /api/* {"
			print "\t\trequest_body {"
			print "\t\t\tmax_size 1MB"
			print "\t\t}"
			print "\t\treverse_proxy 127.0.0.1:8787"
			print "\t}"
			done = 1
		}
		{ print }
	' /etc/caddy/Caddyfile.before-attest > /etc/caddy/Caddyfile
	if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
		cp /etc/caddy/Caddyfile.before-attest /etc/caddy/Caddyfile
		echo "Caddy did not accept the /api route; the old Caddyfile is back. Nothing else changed." >&2
		exit 1
	fi
	systemctl reload caddy
fi

echo
echo "Signer address: ${SIGNER}"
echo "Relayer address (send it a little Mezo testnet BTC for gas): ${RELAYER}"
if [ -f /etc/emberdeep/attest.env ]; then
	systemctl enable emberdeep-attest >/dev/null 2>&1
	systemctl restart emberdeep-attest
	sleep 1
	if curl -fsS http://127.0.0.1:8787/api/health; then
		echo
		echo "The attestation server is running."
	else
		echo "The service did not answer. See: journalctl -u emberdeep-attest -n 50" >&2
		exit 1
	fi
else
	echo "Not started yet: deploy the Hall with this signer address, then run attest.sh again with the Hall's address."
fi
