import { randomUUID } from "node:crypto";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export interface SimulatedTaskResult {
  referenceId: string;
  status: "simulated";
  task: string;
}

export function createReferenceId(uuid: string = randomUUID()): string {
  const compact = uuid.replace(/-/g, "").toUpperCase();
  return `ACT-${compact.slice(0, 8)}`;
}

export function simulateTask(task: string, uuid?: string): SimulatedTaskResult {
  const result: SimulatedTaskResult = {
    referenceId: createReferenceId(uuid),
    status: "simulated",
    task,
  };

  if (process.env.NODE_ENV !== "production") {
    console.log("[nova] execute_task simulated", result);
  }

  return result;
}

export function createExecuteTaskTool() {
  return tool(
    async ({ task_description }) => {
      const result = simulateTask(task_description);
      return JSON.stringify({
        ...result,
        simulated: true,
        note:
          "This is a SIMULATED demo action. No ticket, email, message or external company system was contacted.",
      });
    },
    {
      name: "execute_task",
      description:
        "Create a clearly simulated demo task (for example a ticket for broken WiFi). " +
        "This never calls a real ticketing, messaging or email system. Returns an ACT-XXXXXXXX reference and status 'simulated'.",
      schema: z.object({
        task_description: z
          .string()
          .trim()
          .min(1)
          .max(500)
          .describe("A short description of the simulated task to create."),
      }),
    },
  );
}
