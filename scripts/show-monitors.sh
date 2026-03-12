#!/usr/bin/env bash
# Pretty-print xrandr output: connected monitors and their current mode.

set -e

# Colors
BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
GRAY='\033[0;90m'
DIM='\033[0;2m'
RESET='\033[0m'

print_screen_info() {
  xrandr 2>/dev/null | sed -n '1s/.*current \([0-9]*\) x \([0-9]*\).*/  \1 × \2/p'
}

print_monitors() {
  xrandr 2>/dev/null | awk '
    /^Screen 0:/ { next }
    /^[A-Za-z0-9_-]+ (connected|disconnected)/ {
      name = $1
      status = $2
      if (status == "connected") {
        res = ($3 == "primary") ? $4 : $3
        primary = ($0 ~ /primary/) ? " primary" : ""
        size = ""
        for (i = 3; i <= NF; i++) {
          if ($i ~ /^[0-9]+mm$/ && $(i+1) == "x") { size = " " $i "×" $(i+2); break }
        }
        printf "CONNECTED\t%s\t%s\t%s%s\n", name, res, primary, size
      } else {
        printf "DISCONNECTED\t%s\n", name
      }
      next
    }
    /^[[:space:]]+[0-9]+x[0-9]+/ && status == "connected" {
      mode = $1
      rates = ""
      for (i = 2; i <= NF; i++) rates = rates " " $i
      if (rates ~ /\*/)
        printf "MODE\t%s\t%s\n", mode, rates
    }
  '
}

echo -e "${BOLD}Monitors${RESET}"
echo ""
screen_info=$(print_screen_info)
if [ -n "$screen_info" ]; then
  echo -e "${DIM}Screen (virtual size):${RESET}$screen_info"
  echo ""
fi

current_output=""
while IFS=$'\t' read -r kind rest; do
  case "$kind" in
    CONNECTED)
      name="${rest%%$'\t'*}"
      rest="${rest#*$'\t'}"
      res="${rest%%$'\t'*}"
      extra="${rest#*$'\t'}"
      echo -e "  ${GREEN}●${RESET} ${BOLD}${name}${RESET}"
      echo -e "    ${CYAN}${res}${RESET}${extra}"
      current_output="$name"
      ;;
    DISCONNECTED)
      echo -e "  ${GRAY}○${RESET} ${rest} ${GRAY}(disconnected)${RESET}"
      current_output=""
      ;;
    MODE)
      [ -n "$current_output" ] || continue
      mode="${rest%%$'\t'*}"
      rates="${rest#*$'\t'}"
      echo -e "      ${BOLD}${mode}${RESET} ${rates}"
      ;;
  esac
done < <(print_monitors)

# If no connected outputs, show raw xrandr
if ! print_monitors | grep -q CONNECTED 2>/dev/null; then
  echo -e "${GRAY}No connected outputs. Full xrandr:${RESET}"
  echo ""
  xrandr 2>&1
fi
