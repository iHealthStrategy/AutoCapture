use anyhow::{anyhow, Result};
use std::fs::File;
use std::io::{BufWriter, Read, Write};
use std::path::Path;

/// Combine the given screenshots into a single PDF. Each image becomes one
/// page sized to that image's pixel dimensions at 96 dpi.
pub fn export_pdf(images: &[String], output: &Path) -> Result<()> {
    use printpdf::*;

    if images.is_empty() {
        return Err(anyhow!("没有图片可导出"));
    }

    // Pre-load all images so we know the per-page size.
    let loaded: Vec<::image::DynamicImage> = images
        .iter()
        .map(|p| -> Result<_> {
            let r = ::image::ImageReader::open(p)
                .map_err(|e| anyhow!("无法读取 {}: {}", p, e))?;
            r.decode().map_err(|e| anyhow!("无法解码 {}: {}", p, e))
        })
        .collect::<Result<Vec<_>>>()?;

    let dpi: f32 = 96.0;
    let px_to_mm = |px: u32| (px as f32) * 25.4 / dpi;

    let first = &loaded[0];
    let (doc, page1, layer1) = PdfDocument::new(
        "Auto Capture",
        Mm(px_to_mm(first.width())),
        Mm(px_to_mm(first.height())),
        "Layer 1",
    );

    add_image_to_layer(&doc, page1, layer1, first, dpi)?;

    for img in &loaded[1..] {
        let (page, layer) = doc.add_page(
            Mm(px_to_mm(img.width())),
            Mm(px_to_mm(img.height())),
            "Layer 1",
        );
        add_image_to_layer(&doc, page, layer, img, dpi)?;
    }

    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut file = BufWriter::new(File::create(output)?);
    doc.save(&mut file)?;
    Ok(())
}

fn add_image_to_layer(
    doc: &printpdf::PdfDocumentReference,
    page: printpdf::PdfPageIndex,
    layer: printpdf::PdfLayerIndex,
    img: &::image::DynamicImage,
    dpi: f32,
) -> Result<()> {
    use printpdf::*;

    let rgb = img.to_rgb8();
    let (w, h) = (rgb.width(), rgb.height());
    let raw = rgb.into_raw();
    let image_xobj = ImageXObject {
        width: Px(w as usize),
        height: Px(h as usize),
        color_space: ColorSpace::Rgb,
        bits_per_component: ColorBits::Bit8,
        interpolate: false,
        image_data: raw,
        image_filter: None,
        smask: None,
        clipping_bbox: None,
    };
    let pdf_image = Image::from(image_xobj);
    let layer_ref = doc.get_page(page).get_layer(layer);
    let transform = ImageTransform {
        translate_x: Some(Mm(0.0)),
        translate_y: Some(Mm(0.0)),
        rotate: None,
        scale_x: None,
        scale_y: None,
        dpi: Some(dpi),
    };
    pdf_image.add_to_layer(layer_ref, transform);
    Ok(())
}

/// Export the screenshots as a `.pptx` — each image is one slide that fills
/// the slide canvas. The file is a ZIP of the minimal OOXML structure
/// (Office Open XML).
pub fn export_pptx(images: &[String], output: &Path, title: &str) -> Result<()> {
    if images.is_empty() {
        return Err(anyhow!("没有图片可导出"));
    }

    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let file = File::create(output)?;
    let mut zip = zip::ZipWriter::new(file);
    let opts: zip::write::SimpleFileOptions =
        zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .unix_permissions(0o644);
    let stored: zip::write::SimpleFileOptions =
        zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored)
            .unix_permissions(0o644);

    // [Content_Types].xml
    let mut content_types = String::from(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
"#,
    );
    for i in 1..=images.len() {
        content_types.push_str(&format!(
            r#"<Override PartName="/ppt/slides/slide{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
"#
        ));
    }
    content_types.push_str("</Types>\n");
    write_entry(&mut zip, "[Content_Types].xml", &content_types, opts)?;

    // _rels/.rels
    write_entry(
        &mut zip,
        "_rels/.rels",
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>
"#,
        opts,
    )?;

    // Determine slide size from the FIRST image (EMU: 914400 per inch, 96 dpi → 9525 per px)
    let first_img = ::image::ImageReader::open(&images[0])
        .map_err(|e| anyhow!("无法读取 {}: {}", images[0], e))?
        .decode()
        .map_err(|e| anyhow!("无法解码 {}: {}", images[0], e))?;
    let slide_w_emu: i64 = (first_img.width() as i64) * 9525;
    let slide_h_emu: i64 = (first_img.height() as i64) * 9525;

    // ppt/presentation.xml
    let mut sld_id_lst = String::new();
    for i in 0..images.len() {
        let r_id = i + 2; // rId1 reserved for slide master
        sld_id_lst.push_str(&format!(
            r#"<p:sldId id="{}" r:id="rId{}"/>"#,
            256 + i,
            r_id
        ));
    }
    let presentation_xml = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
<p:sldIdLst>{sld_id_lst}</p:sldIdLst>
<p:sldSize cx="{slide_w_emu}" cy="{slide_h_emu}"/>
<p:notesSz cx="{slide_w_emu}" cy="{slide_h_emu}"/>
</p:presentation>
"#
    );
    write_entry(&mut zip, "ppt/presentation.xml", &presentation_xml, opts)?;

    // ppt/_rels/presentation.xml.rels
    let mut pres_rels = String::from(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
"#,
    );
    for i in 0..images.len() {
        let r_id = i + 2;
        pres_rels.push_str(&format!(
            r#"<Relationship Id="rId{r_id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{}.xml"/>
"#,
            i + 1
        ));
    }
    pres_rels.push_str("</Relationships>\n");
    write_entry(&mut zip, "ppt/_rels/presentation.xml.rels", &pres_rels, opts)?;

    // ppt/slideMasters/slideMaster1.xml + rels (minimal)
    write_entry(
        &mut zip,
        "ppt/slideMasters/slideMaster1.xml",
        SLIDE_MASTER_XML,
        opts,
    )?;
    write_entry(
        &mut zip,
        "ppt/slideMasters/_rels/slideMaster1.xml.rels",
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>
"#,
        opts,
    )?;

    // ppt/slideLayouts/slideLayout1.xml + rels
    write_entry(
        &mut zip,
        "ppt/slideLayouts/slideLayout1.xml",
        SLIDE_LAYOUT_XML,
        opts,
    )?;
    write_entry(
        &mut zip,
        "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>
"#,
        opts,
    )?;

    // ppt/theme/theme1.xml
    write_entry(&mut zip, "ppt/theme/theme1.xml", THEME_XML, opts)?;

    // Per-slide files + per-slide rels + media images
    let _ = title;
    for (i, img_path) in images.iter().enumerate() {
        let slide_idx = i + 1;

        let slide_xml = format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld>
<p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
<p:pic>
<p:nvPicPr>
<p:cNvPr id="2" name="Picture {slide_idx}"/>
<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
<p:nvPr/>
</p:nvPicPr>
<p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
<p:spPr>
<a:xfrm><a:off x="0" y="0"/><a:ext cx="{slide_w_emu}" cy="{slide_h_emu}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
</p:spPr>
</p:pic>
</p:spTree>
</p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>
"#
        );
        write_entry(
            &mut zip,
            &format!("ppt/slides/slide{slide_idx}.xml"),
            &slide_xml,
            opts,
        )?;

        // Per-slide rels referencing the image
        let slide_rels = format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image{slide_idx}.png"/>
</Relationships>
"#
        );
        write_entry(
            &mut zip,
            &format!("ppt/slides/_rels/slide{slide_idx}.xml.rels"),
            &slide_rels,
            opts,
        )?;

        // Copy the PNG into media/ (stored, no recompression)
        let mut buf = Vec::new();
        File::open(img_path)?.read_to_end(&mut buf)?;
        zip.start_file(format!("ppt/media/image{slide_idx}.png"), stored)?;
        zip.write_all(&buf)?;
    }

    zip.finish()?;
    Ok(())
}

fn write_entry<W: Write + std::io::Seek>(
    zip: &mut zip::ZipWriter<W>,
    name: &str,
    body: &str,
    opts: zip::write::SimpleFileOptions,
) -> Result<()> {
    zip.start_file(name, opts)?;
    zip.write_all(body.as_bytes())?;
    Ok(())
}

const SLIDE_MASTER_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>
<p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
</p:spTree></p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>
"#;

const SLIDE_LAYOUT_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
<p:cSld name="Blank">
<p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
</p:spTree></p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>
"#;

const THEME_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
<a:themeElements>
<a:clrScheme name="Office">
<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="44546A"/></a:dk2>
<a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
<a:accent1><a:srgbClr val="4F6CFF"/></a:accent1>
<a:accent2><a:srgbClr val="9047E3"/></a:accent2>
<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
<a:accent4><a:srgbClr val="FFC000"/></a:accent4>
<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
<a:accent6><a:srgbClr val="70AD47"/></a:accent6>
<a:hlink><a:srgbClr val="0563C1"/></a:hlink>
<a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
</a:clrScheme>
<a:fontScheme name="Office">
<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
</a:fontScheme>
<a:fmtScheme name="Office">
<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
<a:lnStyleLst><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
</a:fmtScheme>
</a:themeElements>
</a:theme>
"#;
