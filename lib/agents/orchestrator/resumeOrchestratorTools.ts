import Anthropic from "@anthropic-ai/sdk";

// Tool schemas the Resume Builder orchestrator uses. These are pure
// declarations — actual execution happens client-side (panel-control tools)
// or via existing server agents (writer, rewrite-all). The orchestrator
// emits structured tool_use blocks; the SSE layer forwards them verbatim
// to the client.

export const RESUME_ORCHESTRATOR_TOOLS: Anthropic.Tool[] = [
  {
    name: "apply_fix",
    description:
      "Apply a specific recommended fix from the candidate's action plan. Use when the user says 'fix the summary', 'fix bullet 2', or names a specific section. Pass the priority index (0-based) when known, or a free-text section name.",
    input_schema: {
      type: "object",
      properties: {
        priority_index: {
          type: "number",
          description: "0-based index into rewritePriorities. Prefer this when user references 'fix #1' or you can map their request to a known priority.",
        },
        section: {
          type: "string",
          description: "Free-text section reference (e.g. 'summary', 'skills', 'first bullet at Medallia'). Use when you can't map to a priority index.",
        },
        instruction: {
          type: "string",
          description: "The full instruction to pass to the writer. Required.",
        },
      },
      required: ["instruction"],
    },
  },
  {
    name: "apply_all_fixes",
    description:
      "Apply every remaining priority in the action plan, one after another. Use when user says 'fix everything', 'apply all', 'do them all'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "rewrite_section",
    description:
      "Rewrite a specific section in a particular style. Use when the user asks to rephrase, tighten, or restyle a section without applying a recommended priority.",
    input_schema: {
      type: "object",
      properties: {
        section: {
          type: "string",
          description: "Section to rewrite: 'summary', 'skills', or a bullet reference like 'experience.0.bullets.1'.",
        },
        style_hint: {
          type: "string",
          description: "Optional: 'senior', 'punchy', 'conservative', 'modern', or free-text guidance.",
        },
      },
      required: ["section"],
    },
  },
  {
    name: "show_panel",
    description:
      "Switch the right-side panel to a specific tab. Use when the user says 'show me the report', 'open the resume', 'go to rewrite', etc.",
    input_schema: {
      type: "object",
      properties: {
        tab: {
          type: "string",
          enum: ["resume", "report", "edit", "rewrite"],
        },
      },
      required: ["tab"],
    },
  },
  {
    name: "highlight_section",
    description:
      "Scroll the panel to a specific section and flash a highlight. Use when explaining or pointing to a part of the resume.",
    input_schema: {
      type: "object",
      properties: {
        section_key: {
          type: "string",
          description: "e.g. 'summary', 'skillGroups', 'experience.0.bullets.0'.",
        },
      },
      required: ["section_key"],
    },
  },
  {
    name: "set_style_preference",
    description:
      "Persist a style preference for all future rewrites in this chat. Use when the user expresses a tone preference: 'make me sound senior', 'keep it casual', 'shorter please'.",
    input_schema: {
      type: "object",
      properties: {
        style: {
          type: "string",
          enum: ["modern", "conservative", "senior", "casual", "punchy", "default"],
        },
        note: {
          type: "string",
          description: "Optional free-text capture of nuance (e.g. 'authentic, not corporate').",
        },
      },
      required: ["style"],
    },
  },
  {
    name: "open_rewrite_all",
    description:
      "Switch to the Rewrite tab and start a full resume rewrite. Use when the user wants a clean regeneration from scratch.",
    input_schema: {
      type: "object",
      properties: {
        style: {
          type: "string",
          enum: ["modern", "conservative", "senior", "default"],
        },
      },
    },
  },
  {
    name: "compare_versions",
    description: "Open the side-by-side compare modal: original vs current working copy.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "undo_last",
    description: "Undo the most recent applied fix. Use when the user says 'undo', 'revert that', 'go back'.",
    input_schema: { type: "object", properties: {} },
  },
];
