import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import {
  DEFAULT_HOTKEY,
  DEFAULT_FLIP_SENSITIVITY,
  FLIP_SENSITIVITY_ORDER,
  FLIP_SENSITIVITY_PRESETS,
  loadSettings,
  prettyHotkey,
  saveSettings,
  type FlipSensitivity,
} from "../lib/settings";
import { api } from "../api";
import AppHeader from "../components/AppHeader";
import AppFooter from "../components/AppFooter";
import HotkeyInput from "../components/HotkeyInput";
import type { OutputRootInfo } from "../types";

export default function Settings() {
  const navigate = useNavigate();
  const [hotkey, setHotkey] = useState(() => loadSettings().hotkey);
  const [flipSensitivity, setFlipSensitivity] = useState<FlipSensitivity>(
    () => loadSettings().flipSensitivity,
  );
  const [output, setOutput] = useState<OutputRootInfo | null>(null);
  const [saved, setSaved] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    api.getOutputRoot().then(setOutput).catch(console.error);
  }, []);

  const handleSave = () => {
    saveSettings({ hotkey, flipSensitivity });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleResetHotkey = () => {
    setHotkey(DEFAULT_HOTKEY);
  };

  const handlePickDir = async () => {
    try {
      const picked = await open({
        directory: true,
        multiple: false,
        title: "选择截图保存目录",
        defaultPath: output?.effective,
      });
      if (typeof picked === "string" && picked) {
        setWorking(true);
        const next = await api.setOutputRoot(picked);
        setOutput(next);
        setWorking(false);
      }
    } catch (e) {
      setWorking(false);
      alert(`设置失败: ${e}`);
    }
  };

  const handleResetDir = async () => {
    try {
      setWorking(true);
      const next = await api.setOutputRoot(null);
      setOutput(next);
      setWorking(false);
    } catch (e) {
      setWorking(false);
      alert(`重置失败: ${e}`);
    }
  };

  const handleOpenDir = async () => {
    if (output?.effective) {
      try {
        await api.openOutputDir(output.effective);
      } catch (e) {
        console.error(e);
      }
    }
  };

  return (
    <div className="app-container">
      <AppHeader showSettings={false} />
      <main className="app-content">
      <h1 className="app-title">设置</h1>

      <div className="card">
        <div className="field">
          <label>截图保存目录</label>
          <div className="path-display">
            <span className="path-text" title={output?.effective ?? ""}>
              {output?.effective ?? "加载中…"}
            </span>
            {output?.is_custom && (
              <span className="badge badge-custom">已自定义</span>
            )}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button
              className="secondary"
              onClick={handlePickDir}
              disabled={working}
            >
              选择目录
            </button>
            <button
              className="ghost"
              onClick={handleResetDir}
              disabled={working || !output?.is_custom}
            >
              恢复默认
            </button>
            <button
              className="ghost"
              onClick={handleOpenDir}
              disabled={!output}
            >
              在文件夹中打开
            </button>
          </div>
          <div className="hint">
            默认：{output?.default ?? ""}。修改后立即生效，新录制保存到此目录。
          </div>
        </div>
      </div>

      <div className="card">
        <div className="field">
          <label>截图快捷键</label>
          <div className="row">
            <HotkeyInput value={hotkey} onChange={setHotkey} />
            <button className="ghost" onClick={handleResetHotkey}>
              恢复默认
            </button>
          </div>
          <div className="hint">
            录制时按下此快捷键即可截图。默认 {prettyHotkey(DEFAULT_HOTKEY)}。
            更改后下次开始录制时生效。
          </div>
        </div>
      </div>

      <div className="card">
        <div className="field">
          <label>翻页判定灵敏度</label>
          <div className="segmented" role="radiogroup" aria-label="翻页判定灵敏度">
            {FLIP_SENSITIVITY_ORDER.map((key) => {
              const preset = FLIP_SENSITIVITY_PRESETS[key];
              const active = flipSensitivity === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`segmented-item${active ? " active" : ""}`}
                  onClick={() => setFlipSensitivity(key)}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <div className="hint">
            {FLIP_SENSITIVITY_PRESETS[flipSensitivity].hint}
            。默认「{FLIP_SENSITIVITY_PRESETS[DEFAULT_FLIP_SENSITIVITY].label}」。
            灵敏度越低越不容易被光标、字幕条等小扰动误触发。更改后下次开始录制时生效。
          </div>
        </div>
      </div>

      <div className="row">
        <button onClick={handleSave}>{saved ? "已保存 ✓" : "保存"}</button>
        <button className="secondary" onClick={() => navigate("/")}>
          返回
        </button>
      </div>

      </main>
      <AppFooter />
    </div>
  );
}
