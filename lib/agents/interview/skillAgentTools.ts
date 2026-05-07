import Anthropic from "@anthropic-ai/sdk";

// Tool schemas the Skill Agent uses. The agent decides WHEN to call
// each; the client (InterviewView) executes them locally to drive panel
// state (start the session, advance to next question, etc).

export const SKILL_AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "set_session_config",
    description:
      "Update the planned session config based on what the user just said. Call when the user picks a skill, difficulty, count, or company. Multiple fields can be set in one call. Chain with start_session() in the same turn when the user gave you everything in one go (e.g. 'do SQL medium 3').",
    input_schema: {
      type: "object",
      properties: {
        skill: {
          type: "string",
          description: "Skill to drill — e.g. 'SQL'. Only SQL is supported today.",
        },
        difficulty: {
          type: "string",
          enum: ["easy", "medium", "hard", "mixed"],
          description: "Difficulty filter for the session.",
        },
        count: {
          type: "number",
          description: "Number of questions for the session (1-20).",
        },
        company: {
          type: "string",
          enum: ["google", "meta", "amazon", "snowflake", "databricks", "stripe"],
          description: "Optional company persona — biases tone + question selection toward that company's interview pattern.",
        },
      },
    },
  },
  {
    name: "start_session",
    description:
      "Kick off the practice session with whatever config has been set. Use when the user signals they're ready ('let's go', 'start', 'ready', etc) and the config has at least a skill.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "next_question",
    description:
      "Advance to the next question. Use when the user has just received a verdict and wants to continue ('next', 'next question', 'keep going', 'another').",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "skip_question",
    description:
      "Skip the current question. Use when the user explicitly says 'skip' or 'give up'. Counts the skipped question as a no_hire in the session totals.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "end_session",
    description:
      "End the session early. Use when the user wants to stop ('end', 'done for now', 'I'm done').",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "request_hint",
    description:
      "Mid-question, surface a directional nudge to the candidate WITHOUT giving away the answer. Use when the user explicitly asks for a hint or says they're stuck. The agent's narration should include the actual hint text in chat — this tool is purely a signal to the UI.",
    input_schema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["hint", "trap"],
          description: "'hint' for a directional nudge; 'trap' to warn about a common mistake without solving.",
        },
      },
    },
  },
];
