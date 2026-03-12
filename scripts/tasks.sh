#!/usr/bin/env bash

TASKS_DIR="ai-process/tasks"
DONE_DIR="ai-process/tasks-done"

# Colors
RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
BOLD='\033[1m'
RESET='\033[0m'

get_status() {
  local dir="$1"
  if [ -f "$dir/plan.md" ]; then
    echo "planned"
  elif [ -f "$dir/analyze.md" ]; then
    echo "analyzed"
  else
    echo "new"
  fi
}

get_title() {
  local dir="$1"
  if [ -f "$dir/description.md" ]; then
    grep -m1 '^# ' "$dir/description.md" | sed 's/^# //'
  else
    echo "(no description)"
  fi
}

status_color() {
  case "$1" in
    new)      echo -e "${RED}new${RESET}" ;;
    analyzed) echo -e "${YELLOW}analyzed${RESET}" ;;
    planned)  echo -e "${GREEN}planned${RESET}" ;;
    done)     echo -e "${GRAY}done${RESET}" ;;
    skipped)  echo -e "${YELLOW}skipped${RESET}" ;;
  esac
}

cmd_list() {
  local show_done="${1:-}"

  echo -e "${BOLD}Active tasks:${RESET}"
  if [ -d "$TASKS_DIR" ] && [ "$(ls -A "$TASKS_DIR" 2>/dev/null)" ]; then
    for dir in "$TASKS_DIR"/*/; do
      local name status title
      name=$(basename "$dir")
      status=$(get_status "$dir")
      title=$(get_title "$dir")
      printf "  [%-8s]  %-40s  %s\n" "$(status_color "$status")" "$name" "$title"
    done
  else
    echo -e "  ${GRAY}(no active tasks)${RESET}"
  fi

  if [ "$show_done" = "--done" ] && [ -d "$DONE_DIR" ]; then
    echo ""
    echo -e "${BOLD}Done tasks:${RESET}"
    for dir in "$DONE_DIR"/*/; do
      local name status title
      name=$(basename "$dir")
      status=$([ -f "$dir/skipped.md" ] && echo "skipped" || echo "done")
      title=$(get_title "$dir")
      printf "  [%-8s]  %-40s  %s\n" "$(status_color "$status")" "$name" "$title"
    done
  fi
}

cmd_next() {
  if [ ! -d "$TASKS_DIR" ] || [ -z "$(ls -A "$TASKS_DIR" 2>/dev/null)" ]; then
    echo "No active tasks."
    exit 0
  fi

  for dir in "$TASKS_DIR"/*/; do
    local status
    status=$(get_status "$dir")
    if [ "$status" = "planned" ]; then
      local name title
      name=$(basename "$dir")
      title=$(get_title "$dir")
      echo -e "${BOLD}Next task ready for execution:${RESET}"
      echo -e "  Name:   ${CYAN}$name${RESET}"
      echo -e "  Title:  $title"
      echo -e "  Status: $(status_color "$status")"
      return
    fi
  done

  echo "No tasks with status 'planned' found."
}

cmd_show() {
  local name="$1"
  if [ -z "$name" ]; then
    echo "Usage: tasks.sh show <task-name>"
    exit 1
  fi

  local dir
  if [ -d "$TASKS_DIR/$name" ]; then
    dir="$TASKS_DIR/$name"
  elif [ -d "$DONE_DIR/$name" ]; then
    dir="$DONE_DIR/$name"
    echo -e "${GRAY}(task is done)${RESET}"
  else
    echo "Task not found: $name"
    exit 1
  fi

  local status title
  status=$([ -d "$DONE_DIR/$name" ] && ([ -f "$dir/skipped.md" ] && echo "skipped" || echo "done") || get_status "$dir")
  title=$(get_title "$dir")

  echo -e "${BOLD}$name${RESET}"
  echo -e "  Title:  $title"
  echo -e "  Status: $(status_color "$status")"
  echo -e "  Files:"
  for f in description.md analyze.md plan.md; do
    if [ -f "$dir/$f" ]; then
      echo -e "    ${GREEN}✓${RESET} $f"
    else
      echo -e "    ${GRAY}✗ $f${RESET}"
    fi
  done

  if [ -f "$dir/description.md" ]; then
    echo ""
    cat "$dir/description.md"
  fi
}

case "${1:-list}" in
  list)  cmd_list "${2:-}" ;;
  next)  cmd_next ;;
  show)  cmd_show "$2" ;;
  *)
    echo "Usage: tasks.sh [list [--done] | next | show <task-name>]"
    exit 1
    ;;
esac
