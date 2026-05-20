// Shared inline styles for native form controls so they render readably in
// the dark-themed admin shell (which sets light text on the body). Without
// these, native <select> falls back to OS dark UA styles, producing
// dark-grey-on-darker-grey dropdowns.

export const selectStyle: React.CSSProperties = {
  background: "white",
  color: "#111827",
  border: "1px solid #d1d5db",
  borderRadius: 4,
  padding: "4px 8px",
  fontSize: 12,
  cursor: "pointer",
};

export const inputStyle: React.CSSProperties = {
  background: "white",
  color: "#111827",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 13,
};
