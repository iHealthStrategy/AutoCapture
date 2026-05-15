fn main() {
    // Ensure cargo re-runs the build script (and therefore re-bakes the
    // bundled icon resources) whenever any icon file changes.
    println!("cargo:rerun-if-changed=icons");
    println!("cargo:rerun-if-changed=icons/icon.icns");
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/icon.png");
    tauri_build::build()
}
