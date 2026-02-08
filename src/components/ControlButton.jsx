import { UI_CONFIG } from "../config/appConfig.jsx";

/**
 * Reusable button component for controls
 */
export default function ControlButton({
  onClick,
  children,
  variant = "primary",
  style = {},
  onMouseEnter,
  onMouseLeave,
  ...props
}) {
  const baseStyle = {
    width: "100%",
    padding: variant === "primary" ? UI_CONFIG.buttons.primary.padding : UI_CONFIG.buttons.secondary.padding,
    border: 0,
    borderRadius: variant === "primary" ? UI_CONFIG.buttons.primary.borderRadius : UI_CONFIG.buttons.secondary.borderRadius,
    background: UI_CONFIG.colors.info,
    color: "white",
    cursor: "pointer",
    fontWeight: variant === "primary" ? UI_CONFIG.buttons.primary.fontWeight : UI_CONFIG.buttons.secondary.fontWeight,
    fontSize: variant === "primary" ? UI_CONFIG.buttons.primary.fontSize : UI_CONFIG.buttons.secondary.fontSize,
    transition: variant === "primary" ? UI_CONFIG.buttons.primary.transition : undefined,
    ...style,
  };

  const handleMouseEnter = (e) => {
    if (onMouseEnter) {
      onMouseEnter(e);
    } else {
      e.target.style.background = UI_CONFIG.colors.infoHover;
    }
  };

  const handleMouseLeave = (e) => {
    if (onMouseLeave) {
      onMouseLeave(e);
    } else {
      e.target.style.background = UI_CONFIG.colors.info;
    }
  };

  return (
    <button
      onClick={onClick}
      style={baseStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {children}
    </button>
  );
}
