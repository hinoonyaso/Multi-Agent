export async function validateOutput({ mode, output }) {
  return {
    ok: true,
    mode,
    output,
    note: "Validation is a placeholder and does not enforce contracts yet."
  };
}
