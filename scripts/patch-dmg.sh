#!/usr/bin/env bash
# Inject extra files into a finished Tauri DMG.
#
# Why: Tauri's bundler doesn't expose a way to add loose files alongside the
# .app + /Applications symlink, but we want a copyable 安装说明.txt next to
# them so users can grab the `xattr -dr ...` command without retyping.
#
# Strategy: take the Tauri-built UDZO DMG, convert to read-write (UDRW),
# mount, copy in the extras, run a small AppleScript to position the icon
# nicely, detach, and re-convert to compressed UDZO over the original path.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXTRAS_DIR="$REPO_ROOT/src-tauri/dmg/extras"
DMG_DIR="$REPO_ROOT/src-tauri/target/release/bundle/dmg"

DMG_PATH="${1:-}"
if [[ -z "$DMG_PATH" ]]; then
  DMG_PATH="$(ls -t "$DMG_DIR"/*.dmg 2>/dev/null | head -1 || true)"
fi
if [[ -z "$DMG_PATH" || ! -f "$DMG_PATH" ]]; then
  echo "patch-dmg: no DMG found (looked in $DMG_DIR or arg)" >&2
  exit 1
fi
if [[ ! -d "$EXTRAS_DIR" ]] || [[ -z "$(ls -A "$EXTRAS_DIR" 2>/dev/null)" ]]; then
  echo "patch-dmg: no extras to inject in $EXTRAS_DIR, skipping"
  exit 0
fi

echo "patch-dmg: target = $DMG_PATH"
echo "patch-dmg: extras = $EXTRAS_DIR"

# Detach any leftover AutoCapture volumes from previous runs / Finder previews
# — they'd confuse AppleScript's `tell disk "AutoCapture"` selection later.
while IFS= read -r stale; do
  [[ -n "$stale" ]] || continue
  echo "patch-dmg: ejecting stale mount: $stale"
  hdiutil detach "$stale" 2>/dev/null || hdiutil detach -force "$stale" 2>/dev/null || true
done < <(mount | awk '/\/Volumes\/AutoCapture/{
  match($0, /\/Volumes\/[^()]*/);
  s=substr($0, RSTART, RLENGTH);
  sub(/[[:space:]]+$/, "", s);
  print s
}')

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
RW_DMG="$TMP_DIR/rw.dmg"

# Convert to read-write so we can drop files in.
hdiutil convert "$DMG_PATH" -format UDRW -ov -o "$RW_DMG" >/dev/null

# The converted image has zero slack space — adding any file would fail
# "Read-only file system". Grow it before mounting. 200 MB is plenty for the
# .app + a few KB of extras and HFS+ metadata; the final UDZO re-compresses
# back down to the original size anyway.
hdiutil resize -size 200m "$RW_DMG" >/dev/null

# Attach to a unique mount path so stale "/Volumes/AutoCapture N" leftovers
# from previous runs / Finder previews don't get picked up by mistake. NOT
# using -nobrowse: we need Finder to actually open the volume's window,
# otherwise `set position of item ... of container window` silently no-ops
# and Finder later places the new file at a default grid slot below the
# existing icons, which makes Finder expand the window to fit.
MOUNT_POINT="/Volumes/_AutoCapturePatch.$$"
hdiutil attach -readwrite -mountpoint "$MOUNT_POINT" "$RW_DMG" >/dev/null
if [[ ! -d "$MOUNT_POINT" ]]; then
  echo "patch-dmg: mount at $MOUNT_POINT failed" >&2
  exit 1
fi
# With a custom -mountpoint, Finder displays the volume using the mountpoint
# basename, not the HFS+ volume label. AppleScript `tell disk "..."` expects
# whatever Finder displays.
VOL_NAME="$(basename "$MOUNT_POINT")"
echo "patch-dmg: mounted at $MOUNT_POINT (volume: $VOL_NAME)"

# Copy each extra into the volume root.
shopt -s dotglob
for src in "$EXTRAS_DIR"/*; do
  cp -R "$src" "$MOUNT_POINT/"
done
shopt -u dotglob

# Position the txt icon below the "↓ 双击下方文件…" pointer on the background.
# Window is 540 x 420 with the .app / Applications icons at y=150 and the
# pointer text at y=270; (270, 340) clears the pointer with breathing room.
README_NAME="安装说明.txt"
if [[ -f "$MOUNT_POINT/$README_NAME" ]]; then
  /usr/bin/osascript <<APPLESCRIPT
    tell application "Finder"
      tell disk "$VOL_NAME"
        open
        delay 1
        tell container window
          set position of item "$README_NAME" to {270, 340}
        end tell
        update without registering applications
        delay 2
        close
      end tell
    end tell
APPLESCRIPT
fi

# Let Finder flush .DS_Store before we yank the volume out from under it.
sleep 2

# Detach (retry briefly if Finder is still inspecting).
for i in 1 2 3 4 5; do
  if hdiutil detach "$MOUNT_POINT" >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [[ $i -eq 5 ]]; then
    hdiutil detach -force "$MOUNT_POINT" >/dev/null
  fi
done

# Re-compress back over the original DMG path.
hdiutil convert "$RW_DMG" -format UDZO -imagekey zlib-level=9 -o "$DMG_PATH" -ov >/dev/null
echo "patch-dmg: done — $DMG_PATH"
