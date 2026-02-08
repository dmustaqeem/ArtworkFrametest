import { UI_CONFIG } from "../config/appConfig.jsx";

/**
 * Main controls panel component
 */
export default function ControlsPanel({
  children,
  style = {},
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: UI_CONFIG.controlsPanel.position.top,
        right: UI_CONFIG.controlsPanel.position.right,
        width: UI_CONFIG.controlsPanel.width,
        maxHeight: UI_CONFIG.controlsPanel.maxHeight,
        overflowY: "auto",
        background: UI_CONFIG.controlsPanel.background,
        color: UI_CONFIG.controlsPanel.color,
        padding: UI_CONFIG.controlsPanel.padding,
        borderRadius: UI_CONFIG.controlsPanel.borderRadius,
        zIndex: UI_CONFIG.controlsPanel.zIndex,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
