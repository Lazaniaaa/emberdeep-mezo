# Builds the attestation server and installs or updates it on your Vultr server (PowerShell version of attest.sh).
#   .\deploy\attest.ps1 -Server 203.0.113.5                     first time: prints the signer address
#   .\deploy\attest.ps1 -Server 203.0.113.5 -Hall 0xHallAddress after the Hall is deployed: starts the server
#   .\deploy\attest.ps1 -Server 203.0.113.5 -MezoHall 0xAddress adds the Hall on Mezo (the Ember Pot on Mezo is always on)
# Needs the OpenSSH client (Settings -> Apps -> Optional features), or use Git Bash: bash deploy/attest.sh <IP>
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [string]$Hall = "",
  [string]$MezoHall = ""
)
$ErrorActionPreference = "Stop"

if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
  throw "ssh was not found. Install OpenSSH Client, or use Git Bash: bash deploy/attest.sh $Server"
}
if ($Hall -and $Hall -notmatch '^0x[0-9a-fA-F]{40}$') { throw "Not an address: $Hall" }
if ($MezoHall -and $MezoHall -notmatch '^0x[0-9a-fA-F]{40}$') { throw "Not an address: $MezoHall" }

npm run server:build
if ($LASTEXITCODE -ne 0) { throw "Server build failed" }
if (-not (Test-Path server-dist\attest.mjs)) { throw "server-dist\attest.mjs is missing" }

$target = "root@$Server"
scp server-dist/attest.mjs "${target}:/tmp/emberdeep-attest.mjs"
if ($LASTEXITCODE -ne 0) { throw "Upload failed" }
scp deploy/attest-setup.sh "${target}:/tmp/emberdeep-attest-setup.sh"
if ($LASTEXITCODE -ne 0) { throw "Upload failed" }
ssh $target "sed -i 's/\r$//' /tmp/emberdeep-attest-setup.sh; bash /tmp/emberdeep-attest-setup.sh '$Hall' '$MezoHall'; rm -f /tmp/emberdeep-attest-setup.sh /tmp/emberdeep-attest.mjs"
if ($LASTEXITCODE -ne 0) { throw "Setup on the server failed" }
