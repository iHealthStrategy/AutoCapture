import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { IconRefresh, IconSettings } from "./icons";
import owlClose from "../assets/owl/eyes_close.png";
import owlHalfOpen from "../assets/owl/half_open.png";
import owlOpen from "../assets/owl/eye_open.png";

interface AppHeaderProps {
  /** If provided, a refresh button is shown that calls this on click. */
  onRefresh?: () => void;
  /** Whether to show the settings button (default true). */
  showSettings?: boolean;
}

export default function AppHeader({
  onRefresh,
  showSettings = true,
}: AppHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const container = el.closest(".app-container") as HTMLElement | null;
    const scrollEl =
      (container?.querySelector(".app-content") as HTMLElement | null) ??
      container;
    if (!scrollEl) return;
    const onScroll = () => setScrolled(scrollEl.scrollTop > 4);
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => scrollEl.removeEventListener("scroll", onScroll);
  }, []);

  const owlSrc = pressed ? owlOpen : hover ? owlHalfOpen : owlClose;

  return (
    <header
      ref={headerRef}
      className={`brand-header ${scrolled ? "scrolled" : ""}`}
    >
      <button
        type="button"
        className="brand brand-link"
        onClick={() => navigate(isHome ? "/setup" : "/")}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => {
          setHover(false);
          setPressed(false);
        }}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        aria-label={isHome ? "新建录制" : "回到首页"}
      >
        <div className="brand-mark">
          <img src={owlSrc} alt="" draggable={false} />
        </div>
        <div className="brand-name">
          <div className="brand-title">Auto Capture</div>
          <div className="brand-tagline">设定区域 自动截图</div>
        </div>
      </button>
      <div className="brand-nav">
        {onRefresh && (
          <button
            type="button"
            className="ghost icon"
            onClick={onRefresh}
            title="刷新"
            aria-label="刷新"
          >
            <IconRefresh />
          </button>
        )}
        {showSettings && (
          <button
            type="button"
            className="ghost icon"
            onClick={() => navigate("/settings")}
            title="设置"
            aria-label="设置"
          >
            <IconSettings />
          </button>
        )}
      </div>
    </header>
  );
}
