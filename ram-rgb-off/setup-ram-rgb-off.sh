#!/usr/bin/env bash
# Turn off Corsair Vengeance RGB Pro RAM lighting on headless Ubuntu.
# Builds OpenRGB 0.9 with a read-retry shim for flaky SMBus identification,
# then sets the RAM to Static / 000000.
#
# Usage:  sudo ./setup-ram-rgb-off.sh [--persist] [--force]
#   --persist  also install a systemd service that turns the RAM lights off at every boot
#   --force    continue even if the detected RAM part number is not Vengeance RGB Pro (CMW...)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH="$HERE/vengeance-pro-retry.patch"
BUILD_DIR="/opt/openrgb-ramfix"
BIN="/usr/local/bin/openrgb-ramfix"
DEVICE_MATCH="Corsair Vengeance"   # substring OpenRGB matches against device names (case-insensitive)
PERSIST=0; FORCE=0
for a in "$@"; do
  case "$a" in
    --persist) PERSIST=1 ;;
    --force)   FORCE=1 ;;
    *) echo "Unknown option: $a"; exit 2 ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo "Run with sudo."; exit 1; }
[[ -f "$PATCH" ]] || { echo "Missing $PATCH (keep it next to this script)."; exit 1; }

echo "==> 1/5 Reading your RAM model number from the machine"
apt-get update -qq
apt-get install -y -qq dmidecode >/dev/null
mapfile -t PARTS < <(dmidecode -t 17 | awk -F': ' '/^[ \t]*Part Number:/ {gsub(/[ \t]+$/,"",$2); if ($2!="" && $2!="Unknown" && $2 !~ /NO DIMM/) print $2}')
mapfile -t MAKERS < <(dmidecode -t 17 | awk -F': ' '/^[ \t]*Manufacturer:/ {gsub(/[ \t]+$/,"",$2); if ($2!="" && $2!="Unknown" && $2 !~ /NO DIMM/) print $2}')
if [[ ${#PARTS[@]} -eq 0 ]]; then
  echo "    Could not read a part number from dmidecode."
else
  for i in "${!PARTS[@]}"; do echo "    Stick $((i+1)): ${MAKERS[$i]:-?}  ${PARTS[$i]}"; done
fi
UNIQUE_PARTS="$(printf '%s\n' "${PARTS[@]:-}" | sort -u | paste -sd, -)"
if ! printf '%s\n' "${PARTS[@]:-}" | grep -q '^CMW'; then
  echo "    WARNING: no CMW... part number found. CMW is the Vengeance RGB Pro family;"
  echo "    the retry shim only patches OpenRGB's Vengeance RGB Pro detector."
  [[ $FORCE -eq 1 ]] || { echo "    Re-run with --force to try anyway."; exit 1; }
fi

echo "==> 2/5 Installing build dependencies and SMBus tools"
apt-get install -y -qq git build-essential qtbase5-dev qtbase5-dev-tools \
  libusb-1.0-0-dev libhidapi-dev libmbedtls-dev pkgconf i2c-tools >/dev/null

echo "==> 3/5 Loading SMBus kernel modules (i2c-dev, i2c-piix4 for AMD X570)"
modprobe i2c-dev
modprobe i2c-piix4 || true
printf 'i2c-dev\ni2c-piix4\n' > /etc/modules-load.d/openrgb-ramfix.conf

echo "==> 4/5 Building OpenRGB 0.9 with the read-retry shim (takes a few minutes)"
if [[ ! -d "$BUILD_DIR/.git" ]]; then
  git clone -q --depth 1 --branch release_0.9 https://gitlab.com/CalcProgrammer1/OpenRGB.git "$BUILD_DIR"
fi
cd "$BUILD_DIR"
git checkout -q -- .
git apply --ignore-whitespace "$PATCH"
QMAKE="$(command -v qmake || echo /usr/lib/qt5/bin/qmake)"
"$QMAKE" OpenRGB.pro CONFIG+=release >/dev/null
make -j"$(nproc)" >/dev/null
install -m 0755 openrgb "$BIN"
echo "    Installed $BIN (separate from any packaged openrgb)."

echo "==> 5/5 Detecting devices and turning RAM lights off"
"$BIN" --noautoconnect --list-devices | tee /tmp/openrgb-ramfix-devices.txt
if ! grep -qi "$DEVICE_MATCH" /tmp/openrgb-ramfix-devices.txt; then
  echo
  echo "RAM not detected. Things to try:"
  echo "  * Run again (detection on flaky SMBus can still miss)."
  echo "  * Some ASUS AMD boards need kernel parameter acpi_enforce_resources=lax"
  echo "    (add to GRUB_CMDLINE_LINUX_DEFAULT in /etc/default/grub, run update-grub, reboot)."
  echo "  * Debug log: sudo $BIN --noautoconnect --loglevel debug --list-devices 2>&1 | grep -i vengeance"
  exit 1
fi
"$BIN" --noautoconnect --device "$DEVICE_MATCH" --mode Static --color 000000
echo "    Sent Static / 000000 to every device matching \"$DEVICE_MATCH\"."

if [[ $PERSIST -eq 1 ]]; then
  cat > /etc/systemd/system/ram-rgb-off.service <<EOF
[Unit]
Description=Turn off Corsair RAM RGB (RAM: ${UNIQUE_PARTS:-unknown})
After=systemd-modules-load.service

[Service]
Type=oneshot
ExecStartPre=/bin/sleep 5
ExecStart=$BIN --noautoconnect --device "$DEVICE_MATCH" --mode Static --color 000000

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable ram-rgb-off.service >/dev/null
  echo "    Boot service ram-rgb-off.service enabled."
fi

echo "Done. Check the sticks visually."
