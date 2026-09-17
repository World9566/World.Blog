#!/usr/bin/env bash
set -Eeuo pipefail
if command -v docker >/dev/null; then docker --version; docker compose version; exit 0; fi
source /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 22.04 ]] || { echo 'This installer is verified for Ubuntu 22.04.' >&2; exit 1; }
sudo -n true
for package in docker.io docker-compose docker-compose-v2 containerd runc podman-docker; do
  if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q 'install ok installed'; then
    echo "Existing $package needs a separate migration plan." >&2; exit 1
  fi
done
sudo -n apt-get -o DPkg::Lock::Timeout=60 update
sudo -n env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get -o DPkg::Lock::Timeout=60 install -y ca-certificates curl
sudo -n install -m 0755 -d /etc/apt/keyrings
if [[ ! -s /etc/apt/keyrings/docker.asc ]]; then
  key_file=$(mktemp)
  trap 'rm -f "$key_file"' EXIT
  curl --fail --silent --show-error --location --retry 2 --retry-all-errors --connect-timeout 15 --max-time 60 https://download.docker.com/linux/ubuntu/gpg -o "$key_file"
  sudo -n install -m 0644 "$key_file" /etc/apt/keyrings/docker.asc
fi
if [[ ! -e /etc/apt/sources.list.d/docker.sources ]]; then
  printf 'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/docker.asc\n' "$VERSION_CODENAME" "$(dpkg --print-architecture)" | sudo -n tee /etc/apt/sources.list.d/docker.sources >/dev/null
fi
sudo -n apt-get -o DPkg::Lock::Timeout=60 update
sudo -n env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get -o DPkg::Lock::Timeout=60 install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo -n systemctl enable --now docker
sudo -n docker version --format '{{.Server.Version}}'
sudo -n docker compose version
