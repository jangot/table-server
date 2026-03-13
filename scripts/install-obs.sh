#!/usr/bin/env bash

set -e

echo "Updating packages..."
sudo apt update

echo "Installing OBS and PipeWire dependencies..."
sudo apt install -y \
  obs-studio \
  pipewire \
  pipewire-audio \
  wireplumber \
  xdg-desktop-portal \
  xdg-desktop-portal-kde

echo "Restarting user portal services..."
systemctl --user restart xdg-desktop-portal || true
systemctl --user restart xdg-desktop-portal-kde || true

echo "Checking session type..."
SESSION=$(echo $XDG_SESSION_TYPE)

echo "Session type: $SESSION"

if [ "$SESSION" = "wayland" ]; then
  echo "Wayland detected. PipeWire capture should work."
else
  echo "WARNING: You are not using Wayland."
  echo "PipeWire window capture will not work on X11."
  echo "Use 'Window Capture (Xcomposite)' in OBS instead."
fi

echo ""
echo "Running services:"
ps aux | grep xdg-desktop-portal | grep -v grep || true

echo ""
echo "Setup complete."
echo "Restart OBS before testing PipeWire capture."