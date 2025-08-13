# Ensure .keep in empty folders, remove from non-empty
function manage_keep_files() {
  local TARGET="$1"
  # Find all directories under TARGET
  find "$TARGET" -type d | while read -r dir; do
    # Count non-.keep files in the directory
    count=$(find "$dir" -mindepth 1 -maxdepth 1 ! -name ".keep" | wc -l | xargs)
    if [ "$count" -eq 0 ]; then
      # Directory is empty, ensure .keep exists
      touch "$dir/.keep"
    else
      # Directory is not empty, remove .keep if present
      if [ -f "$dir/.keep" ]; then
        rm "$dir/.keep"
      fi
    fi
  done
}
#!/bin/bash
# Script to manage .pair and .pair_test configuration folders
# Usage: bash pair_content_switch.sh [options] [backup|restore|clean]
# Options:
#   -s [SRC]   Specify source folder (default: .pair)
#   -d [DEST]  Specify destination folder (default: .pair_test)

set -e


SRC="$(dirname "$0")/.pair"
DEST="$(dirname "$0")/.pair_test"

# Parse options
while getopts "s:d:" opt; do
  case $opt in
    s)
      SRC="$OPTARG"
      ;;
    d)
      DEST="$OPTARG"
      ;;
    *)
      echo "Usage: $0 [options] [backup|restore|clean]"
      exit 1
      ;;
  esac
done

shift $((OPTIND-1))

# Validate that SRC and DEST exist
if [ ! -d "$SRC" ]; then
  echo "[ERROR] Source folder $SRC does not exist."
  exit 1
fi
if [ ! -d "$DEST" ]; then
  echo "[ERROR] Destination folder $DEST does not exist."
  exit 1
fi

function backup() {
  echo "[Backup] Syncing $SRC to $DEST ..."
  rsync -a --delete "$SRC/product/" "$DEST/product/"
  rsync -a --delete "$SRC/tech/adopted/" "$DEST/tech/adopted/"
  rsync -a --delete "$SRC/tech/adr/" "$DEST/tech/adr/"
  manage_keep_files "$DEST"
  echo "Backup completed."
}

function restore() {
  echo "[Restore] Syncing $DEST to $SRC ..."
  if [ -d "$DEST/product" ]; then
    rsync -a --delete "$DEST/product/" "$SRC/product/"
  else
    echo "[Restore][ERROR] Source folder $DEST/product not found."
  fi
  if [ -d "$DEST/tech/adopted" ]; then
    rsync -a --delete "$DEST/tech/adopted/" "$SRC/tech/adopted/"
  else
    echo "[Restore][ERROR] Source folder $DEST/tech/adopted not found."
  fi
  if [ -d "$DEST/tech/adr" ]; then
    rsync -a --delete "$DEST/tech/adr/" "$SRC/tech/adr/"
  else
    echo "[Restore][ERROR] Source folder $DEST/tech/adr not found."
  fi
  manage_keep_files "$SRC"
  echo "Restore completed."
}

function clean() {
  echo "[Clean] Removing all git changes in $SRC/product, $SRC/tech/adopted, $SRC/tech/adr ..."
  git checkout -- "$SRC/product" "$SRC/tech/adopted" "$SRC/tech/adr" 2>/dev/null || true
  git clean -fd "$SRC/product" "$SRC/tech/adopted" "$SRC/tech/adr" 2>/dev/null || true
  echo "Clean completed."
}

case "$1" in
  backup)
    backup
    ;;
  restore)
    restore
    ;;
  clean)
    clean
    ;;
  *)
    echo "Usage: $0 [options] [backup|restore|clean]"
    exit 1
    ;;
esac
