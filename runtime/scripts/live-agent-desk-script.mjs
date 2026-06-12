/**
 * Scripted state machine for localhost ValenGateway hook smoke tests.
 * Upserts JSON work-object records in the local card harness only —
 * not wired to the 3D runtime and not human-in-the-loop.
 */

export const LIVE_AGENT_DESK_VERSION = "1.0.0";

export function emptyAgentDeskState() {
  return {
    version: LIVE_AGENT_DESK_VERSION,
    running: false,
    stepIndex: 0,
    startedAt: null,
    completedAt: null,
    label: "idle",
    sculpturePulse: 0,
    agentPhase: "idle"
  };
}

/** @returns {{ cards: object[], report: object, done: boolean, label: string }} */
export function liveAgentDeskStep(state = {}, profile = {}) {
  const step = Number(state.stepIndex || 0);
  const name = profile.operatorName || "Operator";
  const builder = profile.builderName || "Builder";
  const company = profile.companyName || "Demo Co";

  const steps = [
    {
      label: "agent_online",
      agentPhase: "boot",
      sculpturePulse: 0.35,
      cards: [
        {
          id: "agent-desk-ping",
          card_type: "work_object",
          status: "focused",
          priority: 100,
          title: "Agent desk online",
          spatial_state: { space: "foreground", cluster: "agent-desk" },
          card_data: {
            title: "Agent desk online",
            body: `${company} · localhost hook session started (scripted smoke test).`,
            next_action: "Observe",
            meta: "SCRIPTED · LOCAL HARNESS ONLY"
          }
        }
      ],
      report: {
        phase: "WorkspaceMode",
        scene: "card13",
        agentDeskActive: true,
        agentPhase: "boot",
        sculpturePulse: 0.35,
        message: "start-live-agent-desk returned; first tick queued."
      }
    },
    {
      label: "scanning_workspace",
      agentPhase: "thinking",
      sculpturePulse: 0.55,
      cards: [
        {
          id: "agent-desk-ping",
          status: "kept",
          spatial_state: { space: "orbit", cluster: "agent-desk" },
          card_data: {
            title: "Agent desk online",
            body: "Prior foreground record moved to orbit (scripted upsert).",
            next_action: "Orbit"
          }
        },
        {
          id: "agent-desk-scan",
          card_type: "work_object",
          status: "focused",
          priority: 90,
          title: "Scanning workspace",
          spatial_state: { space: "foreground", cluster: "agent-desk" },
          card_data: {
            title: "Scanning workspace",
            body: "Harness reads foreground vs orbit buckets from local JSON — not the WebGL renderer.",
            next_action: "Observe",
            metrics: { hooks_ms: 4, cards_visible: 2 }
          }
        }
      ],
      report: {
        agentPhase: "thinking",
        sculpturePulse: 0.55,
        message: "tick-live-agent-desk upserted foreground + orbit records."
      }
    },
    {
      label: "running_capability",
      agentPhase: "acting",
      sculpturePulse: 0.82,
      cards: [
        {
          id: "agent-desk-scan",
          status: "kept",
          spatial_state: { space: "orbit", cluster: "agent-desk" }
        },
        {
          id: "agent-desk-task",
          card_type: "work_object",
          status: "focused",
          priority: 95,
          title: "Running: manage_valen_hooks",
          spatial_state: { space: "foreground", cluster: "agent-desk" },
          card_data: {
            title: "Running: manage_valen_hooks",
            body: [
              `Operator ${name} · scripted capability step.`,
              "Lists local hook names — not a hosted gateway.",
              "No external API calls in this repository path."
            ].join("\n"),
            next_action: "Stream",
            stream: [
              "▸ list_hooks(manage-valen-hooks)",
              "▸ upsert_cards(local JSON store)",
              "▸ return get-cards buckets"
            ]
          }
        }
      ],
      report: {
        agentPhase: "acting",
        sculpturePulse: 0.82,
        message: "Scripted capability step; cards still harness-only."
      }
    },
    {
      label: "approval_fixture",
      agentPhase: "fixture",
      sculpturePulse: 0.5,
      cards: [
        {
          id: "agent-desk-task",
          status: "kept",
          spatial_state: { space: "orbit", cluster: "agent-desk" }
        },
        {
          id: "agent-desk-approve-fixture",
          card_type: "approval",
          status: "focused",
          priority: 98,
          title: "Example approval card (fixture)",
          spatial_state: { space: "foreground", cluster: "agent-desk" },
          card_data: {
            title: "Example approval card (fixture)",
            body: [
              "Shows approval card_type + actions shape in JSON.",
              "No button handler — next tick auto-advances (smoke test only).",
              "Production M2 would block here for a human Approve click."
            ].join("\n"),
            next_action: "Fixture only",
            actions: ["Approve", "Keep orbiting", "Dismiss"],
            fixture: true
          }
        }
      ],
      report: {
        agentPhase: "fixture",
        sculpturePulse: 0.5,
        message: "Approval-shaped fixture on foreground — not human-in-the-loop."
      }
    },
    {
      label: "complete",
      agentPhase: "complete",
      sculpturePulse: 0.4,
      cards: [
        {
          id: "agent-desk-approve-fixture",
          status: "kept",
          spatial_state: { space: "orbit", cluster: "agent-desk" },
          card_data: {
            title: "Example approval card (fixture)",
            body: "Orbited by scripted tick — status kept, not user-approved.",
            fixture: true
          }
        },
        {
          id: "agent-desk-summary",
          card_type: "work_object",
          status: "focused",
          priority: 88,
          title: "Desk smoke test complete",
          spatial_state: { space: "foreground", cluster: "agent-desk" },
          card_data: {
            title: "Desk smoke test complete",
            body: [
              "✓ Hooks: start-live-agent-desk, tick-live-agent-desk",
              "✓ Local JSON card records: foreground ↔ orbit upserts",
              "✗ Not connected to 3D runtime panels",
              "✗ No human approval flow in this preview",
              "",
              `${builder} — scripted localhost harness only.`
            ].join("\n"),
            next_action: "Review PR scope"
          }
        }
      ],
      report: {
        agentPhase: "complete",
        sculpturePulse: 0.4,
        message: "Script finished. done=true on next poll."
      }
    }
  ];

  if (step >= steps.length) {
    return {
      cards: [],
      report: {
        agentDeskActive: false,
        agentPhase: "idle",
        sculpturePulse: 0,
        message: "Desk idle"
      },
      done: true,
      label: "done"
    };
  }

  const current = steps[step];
  return {
    cards: current.cards,
    report: {
      phase: "WorkspaceMode",
      scene: "card13",
      agentDeskActive: true,
      agentPhase: current.agentPhase,
      sculpturePulse: current.sculpturePulse,
      step: step + 1,
      stepsTotal: steps.length,
      label: current.label,
      scripted: true,
      humanInTheLoop: false,
      message: current.report.message
    },
    done: false,
    label: current.label
  };
}

export function advanceAgentDeskState(state = {}) {
  const next = {
    ...emptyAgentDeskState(),
    ...state,
    stepIndex: Number(state.stepIndex || 0) + 1
  };
  if (state.running && !state.startedAt) next.startedAt = new Date().toISOString();
  return next;
}