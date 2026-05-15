import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

export default function AppFooter() {
  const [version, setVersion] = useState<string>("");
  const [scrolled, setScrolled] = useState(false);
  const footerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(""));
  }, []);

  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const container = el.closest(".app-container") as HTMLElement | null;
    const scrollEl =
      (container?.querySelector(".app-content") as HTMLElement | null) ??
      container;
    if (!scrollEl) return;
    const update = () => {
      const distanceFromBottom =
        scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
      setScrolled(distanceFromBottom > 4);
    };
    scrollEl.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(scrollEl);
    update();
    return () => {
      scrollEl.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  return (
    <footer
      ref={footerRef}
      className={`app-footer ${scrolled ? "scrolled" : ""}`}
    >
      Auto Capture{version && ` · v${version}`} · © {new Date().getFullYear()}{" "}
      共同照护
    </footer>
  );
}
