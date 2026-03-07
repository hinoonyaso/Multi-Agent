export async function runWebsiteMode(context) {
  return {
    status: "placeholder",
    mode: "website",
    pipeline: ["router", "planner", "researcher", "critic", "validator", "finalizer"],
    context
  };
}
