#!/bin/bash
# Builds the attestation server and installs or updates it on your Vultr server. From the project root in Git Bash:
#   bash deploy/attest.sh 203.0.113.5                 first time: prints the signer address for deploying the Hall
#   bash deploy/attest.sh 203.0.113.5 0xHallAddress   after the Hall is deployed: starts the server for that Hall
#   bash deploy/attest.sh 203.0.113.5                 later updates keep the Hall address already set
#   bash deploy/attest.sh 203.0.113.5 "" 0xMezoHall   adds the Hall on Mezo (the Ember Pot on Mezo is always on)
#   KEYS_DIR=~/emberdeep-keys bash deploy/attest.sh 203.0.113.5   a new server: brings the saved signer.key and
#                                                                relayer.key along (a server keeps the keys it has)
# It asks for the server's root password a few times, like deploy.sh.
set -euo pipefail
SERVER="${1:?Usage: bash deploy/attest.sh <server IP> [Hall address]}"
HALL="${2:-}"
MEZO_HALL="${3:-}"
HOST="root@${SERVER}"

npm run server:build
test -f server-dist/attest.mjs

scp server-dist/attest.mjs "$HOST:/tmp/emberdeep-attest.mjs"
if [ -n "${KEYS_DIR:-}" ]; then
	for name in signer relayer; do
		test -f "$KEYS_DIR/$name.key" || { echo "No $name.key in $KEYS_DIR" >&2; exit 1; }
	done
	# The keys travel into a folder only root can read, never through /tmp; the setup script empties it when it ends.
	ssh "$HOST" "rm -rf /root/emberdeep-keys-upload; install -d -m 700 /root/emberdeep-keys-upload"
	scp "$KEYS_DIR/signer.key" "$KEYS_DIR/relayer.key" "$HOST:/root/emberdeep-keys-upload/"
fi
scp deploy/attest-setup.sh "$HOST:/tmp/emberdeep-attest-setup.sh"
# The setup's own result is what this script ends with, so a failed setup is not reported as done.
ssh "$HOST" "sed -i 's/\r$//' /tmp/emberdeep-attest-setup.sh; bash /tmp/emberdeep-attest-setup.sh '$HALL' '$MEZO_HALL'; rc=\$?; rm -f /tmp/emberdeep-attest-setup.sh /tmp/emberdeep-attest.mjs; exit \$rc"
