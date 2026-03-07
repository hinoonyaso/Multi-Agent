export async function runSlideMode(context) {
  return {
    status: "placeholder",
    mode: "slide",
    pipeline: ["router", "planner", "researcher", "critic", "validator", "finalizer"],
    context
  };
}
