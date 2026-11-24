import { describe, expect, it, vi } from "vitest";
import { createExecuteTaskTool, createReferenceId, simulateTask } from "@/lib/tools/executeTask";

describe("execute_task (simulated)", () => {
  it("derives an ACT-XXXXXXXX reference from a UUID", () => {
    expect(createReferenceId("1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed")).toBe("ACT-1B9D6BCD");
    expect(createReferenceId()).toMatch(/^ACT-[0-9A-F]{8}$/);
  });

  it("returns a simulated result and logs it in development", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = simulateTask("broken WiFi");
    expect(result).toMatchObject({ status: "simulated", task: "broken WiFi" });
    expect(result.referenceId).toMatch(/^ACT-[0-9A-F]{8}$/);
    expect(log).toHaveBeenCalledWith("[nova] execute_task simulated", result);
    log.mockRestore();
  });

  it("tool output says it is a simulation", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const output = await createExecuteTaskTool().invoke({ task_description: "Laptop repair" });
    const parsed = JSON.parse(String(output));
    expect(parsed).toMatchObject({ status: "simulated", simulated: true, task: "Laptop repair" });
    expect(parsed.note).toMatch(/SIMULATED/);
  });
});
