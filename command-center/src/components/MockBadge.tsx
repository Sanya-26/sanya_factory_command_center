// Small yellow "MOCK" pill, reused anywhere a financial / placeholder number is shown.

export function MockBadge({ size = "sm" }: { size?: "sm" | "xs" }) {
  const padding = size === "xs" ? "1px 5px" : "2px 7px";
  const fontSize = size === "xs" ? 9 : 10;
  return (
    <span
      title="Placeholder data — replace with a real source before production."
      style={{
        background: "#fef3c7",
        color: "#92400e",
        padding,
        borderRadius: 999,
        fontSize,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        border: "1px solid #fde68a",
        marginLeft: 6,
        verticalAlign: "middle",
      }}
    >
      mock
    </span>
  );
}
