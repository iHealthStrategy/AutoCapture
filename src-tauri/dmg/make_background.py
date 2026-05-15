#!/usr/bin/env python3
"""Generate the DMG mount-window background image.

Run from repo root:  python3 src-tauri/dmg/make_background.py

The detailed install instructions live in 安装说明.txt (added to the DMG by
scripts/patch-dmg.sh). The background image only carries the visual cues:
title, drag arrow, and a small pointer to the txt file Finder places below.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = Path(__file__).parent
W, H = 540, 420
SCALE = 2  # render at 2x for crispness

# Fonts — macOS only.
FONT_CANDIDATES = [
    "/System/Library/AssetsV2/com_apple_MobileAsset_Font7/3419f2a427639ad8c8e139149a287865a90fa17e.asset/AssetData/PingFang.ttc",
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
]


def font(size: int, weight_index: int = 0) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size * SCALE, index=weight_index)
            except OSError:
                continue
    return ImageFont.load_default()


def draw_arrow(d: ImageDraw.ImageDraw, x1: int, x2: int, y: int, color: tuple) -> None:
    sx, sy = x1 * SCALE, y * SCALE
    ex, ey = x2 * SCALE, y * SCALE
    width = 3 * SCALE
    d.line([(sx, sy), (ex, ey)], fill=color, width=width)
    head = 10 * SCALE
    d.polygon(
        [(ex, ey), (ex - head, ey - head // 2), (ex - head, ey + head // 2)],
        fill=color,
    )


def main() -> None:
    img = Image.new("RGB", (W * SCALE, H * SCALE), (250, 249, 246))
    d = ImageDraw.Draw(img)

    accent = (44, 95, 184)
    text_main = (38, 42, 51)
    text_sub = (110, 116, 128)

    # Title.
    f_title = font(28, weight_index=4)
    t_title = "AutoCapture"
    tw = d.textlength(t_title, font=f_title)
    d.text(((W * SCALE - tw) / 2, 28 * SCALE), t_title, fill=text_main, font=f_title)

    # Subtitle.
    f_sub = font(13)
    t_sub = "在线会议 PPT 一键截图"
    sw = d.textlength(t_sub, font=f_sub)
    d.text(((W * SCALE - sw) / 2, 64 * SCALE), t_sub, fill=text_sub, font=f_sub)

    # Drag hint (above the icon row so it doesn't fight Finder's icon labels).
    f_drag = font(12)
    drag_t = "拖动到右侧「应用程序」"
    dw = d.textlength(drag_t, font=f_drag)
    d.text(((W * SCALE - dw) / 2, 105 * SCALE), drag_t, fill=accent, font=f_drag)

    # Arrow between the icon slots (centers at x=140 and x=400, y=150).
    draw_arrow(d, 215, 325, 150, accent)

    # Pointer toward the 安装说明.txt icon (placed by AppleScript at (270, 340)).
    f_pointer = font(12, weight_index=4)
    pointer_t = "↓ 双击下方文件查看安装与授权说明"
    pw = d.textlength(pointer_t, font=f_pointer)
    d.text(
        ((W * SCALE - pw) / 2, 270 * SCALE),
        pointer_t,
        fill=text_main,
        font=f_pointer,
    )

    # Save 1x and 2x.
    out_1x = OUT_DIR / "background.png"
    out_2x = OUT_DIR / "background@2x.png"
    img.save(out_2x, "PNG", optimize=True)
    img.resize((W, H), Image.LANCZOS).save(out_1x, "PNG", optimize=True)
    print(f"Wrote {out_1x} ({W}x{H}) and {out_2x} ({W * SCALE}x{H * SCALE})")


if __name__ == "__main__":
    main()
