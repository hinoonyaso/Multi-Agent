export async function runSheetMode(context) {
  return {
    status: "placeholder",
    mode: "sheet",
    pipeline: ["router", "planner", "researcher", "critic", "validator", "finalizer"],
    context
  };
}
