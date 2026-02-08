import { UI_CONFIG } from "../config/appConfig.jsx";

/**
 * Reusable collapsible section component
 */
export default function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  children,
  count,
  style = {},
}) {
  return (
    <div style={{ marginTop: 14, fontFamily: "monospace", fontSize: 12, ...style }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          padding: 10,
          border: 0,
          borderRadius: 6,
          background: isOpen ? "#555" : "#444",
          color: "white",
          cursor: "pointer",
          fontWeight: 700,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>
          {title}
          {count !== undefined && count !== null && ` (${count})`}
        </span>
        <span>{isOpen ? "−" : "+"}</span>
      </button>

      {isOpen && (
        <div style={{ marginTop: 10 }}>
          {children}
        </div>
      )}
    </div>
  );
}
