import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// This route is rarely shown — the floating window is the primary UI during
// recording. If user lands here directly, redirect home.
export default function Recording() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/review");
  }, [navigate]);
  return null;
}
