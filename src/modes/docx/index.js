export async function runDocxMode(context) {
  return {
    status: "placeholder",
    mode: "docx",
    pipeline: ["router", "planner", "researcher", "critic", "validator", "finalizer"],
    context
  };
}
