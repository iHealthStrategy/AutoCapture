import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import Home from "./pages/Home";
import Setup from "./pages/Setup";
import Recording from "./pages/Recording";
import Review from "./pages/Review";
import RegionSelect from "./pages/RegionSelect";
import Floating from "./pages/Floating";
import Viewer from "./pages/Viewer";
import RegionOverlay from "./pages/RegionOverlay";
import Settings from "./pages/Settings";
import "./styles.css";

const TRANSPARENT_ROUTES = new Set([
  "/region-select",
  "/floating",
  "/region-overlay",
]);

function BodyBackground() {
  const loc = useLocation();
  useEffect(() => {
    if (TRANSPARENT_ROUTES.has(loc.pathname)) {
      document.body.classList.remove("app-bg");
    } else {
      document.body.classList.add("app-bg");
    }
  }, [loc.pathname]);
  return null;
}

function NavigationBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    const u = listen<string>("navigate", (e) => {
      if (typeof e.payload === "string") {
        navigate(e.payload);
      }
    });
    return () => {
      u.then((f) => f()).catch(() => {});
    };
  }, [navigate]);
  return null;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <BodyBackground />
      <NavigationBridge />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/recording" element={<Recording />} />
        <Route path="/review" element={<Review />} />
        <Route path="/region-select" element={<RegionSelect />} />
        <Route path="/floating" element={<Floating />} />
        <Route path="/region-overlay" element={<RegionOverlay />} />
        <Route path="/viewer" element={<Viewer />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>,
);
