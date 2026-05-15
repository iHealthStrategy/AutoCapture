use anyhow::{anyhow, Result};
use image::{ImageBuffer, RgbaImage};
use serde::{Deserialize, Serialize};
use xcap::Monitor;

#[derive(Debug, Serialize)]
pub struct Thumbnail {
    pub width: u32,
    pub height: u32,
    pub gray: Vec<u8>,
}

/// A region in the virtual desktop coordinate system (logical pixels).
/// Origin is the top-left of the leftmost-topmost monitor (or system-defined virtual origin).
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Region {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Region {
    pub fn right(&self) -> i32 {
        self.x + self.width as i32
    }
    pub fn bottom(&self) -> i32 {
        self.y + self.height as i32
    }
    pub fn is_valid(&self) -> bool {
        self.width > 0 && self.height > 0
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct MonitorInfo {
    pub id: u32,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f32,
    pub is_primary: bool,
}

pub fn list_monitors() -> Result<Vec<MonitorInfo>> {
    let monitors = Monitor::all().map_err(|e| anyhow!("无法枚举显示器: {}", e))?;
    let mut out = Vec::new();
    for m in monitors {
        out.push(MonitorInfo {
            id: m.id().unwrap_or(0),
            name: m.name().unwrap_or_default(),
            x: m.x().unwrap_or(0),
            y: m.y().unwrap_or(0),
            width: m.width().unwrap_or(0),
            height: m.height().unwrap_or(0),
            scale_factor: m.scale_factor().unwrap_or(1.0),
            is_primary: m.is_primary().unwrap_or(false),
        });
    }
    Ok(out)
}

/// Capture the given logical region. The region may span multiple monitors.
/// Returns an RGBA image. If the region intersects multiple monitors, they are stitched.
pub fn capture_region(region: &Region) -> Result<RgbaImage> {
    if !region.is_valid() {
        return Err(anyhow!("Invalid region"));
    }

    let monitors = Monitor::all().map_err(|e| anyhow!("无法枚举显示器: {}", e))?;

    // Find intersecting monitors.
    let mut intersecting: Vec<(Monitor, MonitorInfo)> = Vec::new();
    for m in monitors {
        let info = MonitorInfo {
            id: m.id().unwrap_or(0),
            name: m.name().unwrap_or_default(),
            x: m.x().unwrap_or(0),
            y: m.y().unwrap_or(0),
            width: m.width().unwrap_or(0),
            height: m.height().unwrap_or(0),
            scale_factor: m.scale_factor().unwrap_or(1.0),
            is_primary: m.is_primary().unwrap_or(false),
        };
        let mx2 = info.x + info.width as i32;
        let my2 = info.y + info.height as i32;
        let overlap_x = region.x.max(info.x) < region.right().min(mx2);
        let overlap_y = region.y.max(info.y) < region.bottom().min(my2);
        if overlap_x && overlap_y {
            intersecting.push((m, info));
        }
    }

    if intersecting.is_empty() {
        return Err(anyhow!("所选区域不在任何显示器内"));
    }

    // Single-monitor fast path.
    if intersecting.len() == 1 {
        let (m, info) = &intersecting[0];
        let full = m.capture_image().map_err(|e| anyhow!("截屏失败: {}", e))?;
        let full: RgbaImage = full;
        return Ok(crop_to_region(&full, info, region));
    }

    // Multi-monitor: capture each, crop its portion, then stitch into one image
    // sized to the region in *physical pixels of the primary intersecting monitor*.
    // For simplicity we use the max scale factor among intersected monitors.
    let scale = intersecting
        .iter()
        .map(|(_, info)| info.scale_factor)
        .fold(1.0_f32, |a, b| a.max(b));

    let out_w = (region.width as f32 * scale).round() as u32;
    let out_h = (region.height as f32 * scale).round() as u32;
    let mut canvas: RgbaImage = ImageBuffer::new(out_w, out_h);

    for (m, info) in &intersecting {
        let full = m.capture_image().map_err(|e| anyhow!("截屏失败: {}", e))?;
        let cropped = crop_to_region(&full, info, region);

        // Where this monitor's cropped output sits inside the canvas (logical coords).
        let logical_dx = (region.x.max(info.x) - region.x) as f32;
        let logical_dy = (region.y.max(info.y) - region.y) as f32;
        let dx = (logical_dx * scale).round() as i32;
        let dy = (logical_dy * scale).round() as i32;

        // Resize cropped to match canvas scale if its monitor has a different scale.
        let target_w = ((cropped.width() as f32) * scale / info.scale_factor).round() as u32;
        let target_h = ((cropped.height() as f32) * scale / info.scale_factor).round() as u32;
        let resized = if target_w == cropped.width() && target_h == cropped.height() {
            cropped
        } else {
            image::imageops::resize(
                &cropped,
                target_w.max(1),
                target_h.max(1),
                image::imageops::FilterType::Lanczos3,
            )
        };

        image::imageops::overlay(&mut canvas, &resized, dx as i64, dy as i64);
    }

    Ok(canvas)
}

/// Capture the region and downscale to a small grayscale thumbnail for cheap
/// frame-diffing (used by the auto page-flip detector). `max_dim` bounds the
/// longest side; the result preserves aspect ratio.
pub fn capture_thumbnail(region: &Region, max_dim: u32) -> Result<Thumbnail> {
    let img = capture_region(region)?;
    let w = img.width().max(1);
    let h = img.height().max(1);
    let max_dim = max_dim.max(1);
    let longest = w.max(h);
    let (tw, th) = if longest <= max_dim {
        (w, h)
    } else {
        let scale = max_dim as f32 / longest as f32;
        (
            ((w as f32 * scale).round() as u32).max(1),
            ((h as f32 * scale).round() as u32).max(1),
        )
    };
    let small = if tw == w && th == h {
        img
    } else {
        image::imageops::resize(&img, tw, th, image::imageops::FilterType::Triangle)
    };
    let mut gray = Vec::with_capacity((tw * th) as usize);
    for p in small.pixels() {
        // BT.601 luma.
        let r = p.0[0] as u32;
        let g = p.0[1] as u32;
        let b = p.0[2] as u32;
        gray.push(((r * 299 + g * 587 + b * 114) / 1000) as u8);
    }
    Ok(Thumbnail {
        width: tw,
        height: th,
        gray,
    })
}

/// Crop a full-monitor image down to the intersection with `region`.
/// `full` is in physical pixels; region/monitor coords are logical pixels.
fn crop_to_region(full: &RgbaImage, info: &MonitorInfo, region: &Region) -> RgbaImage {
    let scale = info.scale_factor.max(0.01);

    // Intersection in logical coords.
    let lx1 = region.x.max(info.x);
    let ly1 = region.y.max(info.y);
    let lx2 = region.right().min(info.x + info.width as i32);
    let ly2 = region.bottom().min(info.y + info.height as i32);

    // Convert to monitor-local logical coords.
    let local_x = (lx1 - info.x) as f32;
    let local_y = (ly1 - info.y) as f32;
    let local_w = (lx2 - lx1) as f32;
    let local_h = (ly2 - ly1) as f32;

    // Logical -> physical.
    let px = (local_x * scale).round() as i64;
    let py = (local_y * scale).round() as i64;
    let pw = (local_w * scale).round() as u32;
    let ph = (local_h * scale).round() as u32;

    // Clamp to image bounds.
    let img_w = full.width() as i64;
    let img_h = full.height() as i64;
    let px = px.max(0).min(img_w);
    let py = py.max(0).min(img_h);
    let pw = pw.min((img_w - px) as u32);
    let ph = ph.min((img_h - py) as u32);

    if pw == 0 || ph == 0 {
        return ImageBuffer::new(1, 1);
    }

    image::imageops::crop_imm(full, px as u32, py as u32, pw, ph).to_image()
}
