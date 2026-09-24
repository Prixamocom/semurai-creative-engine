import type { OpenDesignPlanContractV2 } from '@open-design/contracts';
import { describe, expect, it } from 'vitest';

import {
  OdNextMachineProtocolStream,
  passThroughOrdinaryAssistantText,
} from '../../../src/strategies/od-next/protocol.js';

const plan = {
  schema: 'open-design.plan-contract/v2',
  strategy: {
    id: 'od-next-strategy',
    version: '2.0.0',
    packageHash: 'a'.repeat(64),
    snapshotId: 'snapshot-1',
  },
  taskProfile: {
    schemaVersion: '2',
    taskType: 'prototype',
    taskProfileVersion: '2.0.0',
    goal: 'Build a prototype',
    contextAndAudience: 'Operators',
    inputsAndReferences: ['request'],
    constraints: [],
    canonicalDeliverable: { id: 'prototype', kind: 'prototype', format: 'html' },
    requiredDeliverables: [{ id: 'prototype', kind: 'prototype' }],
    designSpec: {
      source: 'resolved-baseline',
      version: '1',
      decisions: { palette: 'neutral' },
    },
    buildRequirements: [{ id: 'build', text: 'Build the prototype.' }],
    assumptions: [],
    risks: [],
    taskSpecific: {},
  },
  fullPlan: {
    executionMode: 'simple',
    steps: [{ id: 'build', objective: 'Build', outputs: ['prototype'] }],
    readinessArtifacts: [],
    buildPackages: [],
  },
  runManifest: {
    selectedAgentId: 'codex',
    capabilitySnapshotHash: 'b'.repeat(64),
    inputRefs: ['request'],
    productionRoutes: ['html'],
    preflight: { intake: 'passed', execution: 'passed' },
  },
  decisionSummary: {
    goal: 'Build a prototype',
    deliverables: ['prototype'],
    keyConstraints: [],
    assumptions: [],
    risks: [],
    openDecisions: [],
  },
} as const;

const state = {
  schema: 'open-design.strategy-state/v2',
  route: 'full_plan',
  inputStage: 'request',
  outcome: 'plan_ready',
  executionMode: 'simple',
  reasonCodes: [],
} as const;

function machineBlock(tag: string, value: unknown): string {
  return `<${tag}>\n${JSON.stringify(value)}\n</${tag}>`;
}

describe('OD Next machine protocol stream', () => {
  it('recognizes exact blocks across every chunk boundary and never returns machine bytes', () => {
    const wire = [
      'Ready to build.\n',
      machineBlock('open-design-plan-contract', plan),
      '\n',
      machineBlock('open-design-runtime-state', state),
      '\nOne open decision remains.',
    ].join('');

    for (let split = 0; split <= wire.length; split += 1) {
      const stream = new OdNextMachineProtocolStream();
      const visible = stream.push(wire.slice(0, split)) + stream.push(wire.slice(split));
      const result = stream.finish();
      expect(visible).not.toContain('open-design-plan-contract');
      expect(visible).not.toContain('open-design-runtime-state');
      expect(result.visibleText).toBe('Ready to build.\n\n\nOne open decision remains.');
      expect(result.issues).toEqual([]);
      expect(result.planContract).toEqual(plan);
      expect(result.runtimeState).toEqual(state);
    }
  });

  it('normalizes a premature clarification execution mode instead of failing schema', () => {
    // Observed field shape: the agent asks for clarification but also
    // predicts the eventual execution mode. The prediction has no authority
    // at this stage, so it is discarded rather than fatal.
    const stream = new OdNextMachineProtocolStream();
    stream.push([
      '先对齐两个问题。',
      '<open-design-runtime-state>',
      JSON.stringify({
        schema: 'open-design.strategy-state/v2',
        route: 'full_plan',
        inputStage: 'request',
        outcome: 'clarification_required',
        executionMode: 'simple',
        reasonCodes: ['scope_required'],
      }),
      '</open-design-runtime-state>',
    ].join('\n'));
    const result = stream.finish();
    expect(result.issues).toEqual([]);
    expect(result.runtimeState).toMatchObject({
      outcome: 'clarification_required',
      executionMode: null,
    });
    expect(result.normalizations).toEqual([
      'od_next_protocol_clarification_execution_mode_normalized',
    ]);
  });

  it('does not treat Markdown headings or ordinary JSON as machine protocol', () => {
    const text = '# Plan Contract\n\n```json\n{"route":"full_plan"}\n```';
    const stream = new OdNextMachineProtocolStream();
    expect(stream.push(text)).toBe(text);
    const result = stream.finish();
    expect(result.visibleText).toBe(text);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'od_next_protocol_runtime_state_missing',
    ]);
  });

  it('fails closed on duplicates without selecting the last block', () => {
    const stream = new OdNextMachineProtocolStream();
    const visible = stream.push([
      'summary',
      machineBlock('open-design-plan-contract', plan),
      machineBlock('open-design-plan-contract', plan),
      machineBlock('open-design-runtime-state', state),
    ].join('\n'));
    const result = stream.finish();

    expect(visible).toBe('summary\n\n\n');
    expect(result.planContract).toBeUndefined();
    expect(result.repairPlanContract).toBeUndefined();
    expect(result.issues.map((issue) => issue.code)).toContain(
      'od_next_protocol_plan_contract_duplicate',
    );
  });

  it('keeps one schema-valid fenced contract only as a repair anchor', () => {
    const stream = new OdNextMachineProtocolStream();
    stream.push([
      '<open-design-plan-contract>',
      '```json',
      JSON.stringify(plan),
      '```',
      '</open-design-plan-contract>',
      machineBlock('open-design-runtime-state', state),
    ].join('\n'));
    const result = stream.finish();

    expect(result.planContract).toBeUndefined();
    expect(result.repairPlanContract).toEqual(plan);
    expect(result.issues.map((issue) => issue.code)).toContain(
      'od_next_protocol_plan_contract_invalid_json',
    );
  });

  it('recovers a repair anchor from prose wrapped around the contract', () => {
    // The whole-body fence pattern only matches a block that is nothing but a
    // fence. An agent that narrates either side of its JSON produced no anchor
    // at all, so the one allowed serialization repair could not engage and the
    // task went straight to a terminal block.
    const stream = new OdNextMachineProtocolStream();
    stream.push([
      '<open-design-plan-contract>',
      'Here is the plan:',
      '```json',
      JSON.stringify(plan),
      '```',
      'Let me know if you want changes.',
      '</open-design-plan-contract>',
      machineBlock('open-design-runtime-state', state),
    ].join('\n'));
    const result = stream.finish();

    expect(result.planContract).toBeUndefined();
    expect(result.repairPlanContract).toEqual(plan);
  });

  it('does not recover an anchor from a body that carries no complete object', () => {
    // Fail closed: a truncated block must stay unrecovered rather than have a
    // partial object mistaken for a declaration.
    const stream = new OdNextMachineProtocolStream();
    stream.push([
      '<open-design-plan-contract>',
      JSON.stringify(plan).slice(0, 60),
      '</open-design-plan-contract>',
      machineBlock('open-design-runtime-state', state),
    ].join('\n'));
    const result = stream.finish();

    expect(result.planContract).toBeUndefined();
    expect(result.repairPlanContract).toBeUndefined();
  });

  it('does not end the recovered object on a brace inside a string value', () => {
    const withBrace = {
      ...plan,
      taskProfile: { ...plan.taskProfile, goal: 'Build a prototype using { and } in prose' },
    };
    const stream = new OdNextMachineProtocolStream();
    stream.push([
      '<open-design-plan-contract>',
      'plan follows',
      JSON.stringify(withBrace),
      '</open-design-plan-contract>',
      machineBlock('open-design-runtime-state', state),
    ].join('\n'));
    const result = stream.finish();

    expect(result.repairPlanContract).toEqual(withBrace);
  });

  it('suppresses malformed and oversized reserved blocks instead of leaking them', () => {
    const stream = new OdNextMachineProtocolStream({ maxMachineBlockBytes: 64 });
    const visible = stream.push(
      `before<open-design-plan-contract data-x="bad">${'x'.repeat(200)}\n</open-design-plan-contract>after`,
    );
    const result = stream.finish();

    expect(visible).toBe('beforeafter');
    expect(result.visibleText).toBe('beforeafter');
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'od_next_protocol_machine_block_malformed',
      'od_next_protocol_machine_block_too_large',
      'od_next_protocol_runtime_state_missing',
    ]));
  });

  it('consumes an incomplete closing tag at EOF across every chunk boundary', () => {
    const complete = machineBlock('open-design-plan-contract', plan);
    const wire = `summary\n${complete.slice(0, -1)}`;

    for (let split = 0; split <= wire.length; split += 1) {
      const stream = new OdNextMachineProtocolStream();
      const visible = stream.push(wire.slice(0, split)) + stream.push(wire.slice(split));
      const result = stream.finish();

      expect(visible, `split ${split}`).toBe('summary\n');
      expect(result.visibleText, `split ${split}`).toBe('summary\n');
      expect(result.planContract, `split ${split}`).toBeUndefined();
      expect(result.repairPlanContract, `split ${split}`).toEqual(plan);
      expect(result.issues.map((issue) => issue.code), `split ${split}`).toEqual(
        expect.arrayContaining([
          'od_next_protocol_machine_block_malformed',
          'od_next_protocol_runtime_state_missing',
        ]),
      );
    }
  });

  it('leaves the ordinary Run path byte-for-byte unchanged', () => {
    const ordinary = `Visible <open-design-runtime-state>{"not":"active"}</open-design-runtime-state>`;
    expect(passThroughOrdinaryAssistantText(null, ordinary)).toBe(ordinary);

    const strategy = new OdNextMachineProtocolStream();
    expect(passThroughOrdinaryAssistantText(strategy, ordinary)).toBe('Visible ');
    expect(strategy.finish().visibleText).toBe('Visible ');
  });

  it('does not terminate suppression on a closing-tag string inside JSON', () => {
    const hostile = structuredClone(plan) as unknown as OpenDesignPlanContractV2;
    hostile.taskProfile.goal = 'Never leak </open-design-plan-contract> machine bytes';
    hostile.decisionSummary.goal = hostile.taskProfile.goal;
    const stream = new OdNextMachineProtocolStream();
    const visible = stream.push([
      'summary',
      machineBlock('open-design-plan-contract', hostile),
      machineBlock('open-design-runtime-state', state),
    ].join('\n'));
    const result = stream.finish();

    expect(visible).toBe('summary\n\n');
    expect(result.planContract).toMatchObject({
      taskProfile: { goal: hostile.taskProfile.goal },
    });
    expect(result.issues).toEqual([]);
  });
});

describe('OD Next machine protocol stream - false-opening recovery', () => {
  const runtimeTag = 'open-design-runtime-state';
  const planTag = 'open-design-plan-contract';
  const productionState = {
    schema: 'open-design.strategy-state/v2',
    route: 'full_plan',
    inputStage: 'production',
    outcome: 'completed',
    executionMode: 'simple',
    reasonCodes: [],
  } as const;
  const suggestions = [
    '<od-next key="k1" value="Dodaj slajd z cenami"/>',
    '<od-next key="k1" value="Zmien palete na ciemna"/>',
    '<od-next key="k1" value="Skroc naglowki"/>',
  ].join('\n');

  // Reproduction of the production failure: a long internal handoff summary
  // names the reserved tag mid-sentence, then the real Polish reply and the
  // real line-start Runtime State block follow, then the next-step markers.
  const summary = [
    'Handoff summary: design.json is valid, all 5 slides are exported.',
    'Remaining: then write the final pl reply, and emit `<open-design-runtime-state>`, then JSON, then the closing `</open-design-runtime-state>` on its own line.',
    'Keep the palette from the brief.',
    '',
  ].join('\n');
  const reply = 'Gotowe! Karuzela na Instagram ma 5 slajdow i jest zapisana w projekcie.\n';
  const productionWire = `${summary}${reply}${machineBlock(runtimeTag, productionState)}\n${suggestions}`;
  const expectedProductionVisible = [
    'Handoff summary: design.json is valid, all 5 slides are exported.',
    'Remaining: then write the final pl reply, and emit ``, then JSON, then the closing `` on its own line.',
    'Keep the palette from the brief.',
    '',
  ].join('\n') + reply + '\n' + suggestions;

  function expectNoMachineLeak(visible: string): void {
    expect(visible).not.toContain(`<${runtimeTag}`);
    expect(visible).not.toContain(`</${runtimeTag}`);
    expect(visible).not.toContain(`<${planTag}`);
    expect(visible).not.toContain(`</${planTag}`);
    expect(visible).not.toContain('open-design.strategy-state/v2');
    expect(visible).not.toContain('open-design.plan-contract/v2');
  }

  it('recovers the real Runtime State after a mid-sentence reserved opening tag', () => {
    const stream = new OdNextMachineProtocolStream();
    const visible = stream.push(productionWire);
    const result = stream.finish();

    expect(result.issues).toEqual([]);
    expect(result.runtimeState).toEqual(productionState);
    expect(result.repairRuntimeState).toBeUndefined();
    expect(visible).toBe(expectedProductionVisible);
    expect(result.visibleText).toBe(expectedProductionVisible);
    expect(result.visibleText).toContain(reply);
    expectNoMachineLeak(result.visibleText);
  });

  it('recovers identically across every two-chunk split and many small chunks', () => {
    for (let split = 0; split <= productionWire.length; split += 1) {
      const stream = new OdNextMachineProtocolStream();
      const visible = stream.push(productionWire.slice(0, split))
        + stream.push(productionWire.slice(split));
      const result = stream.finish();
      expect(result.issues, `split ${split}`).toEqual([]);
      expect(result.runtimeState, `split ${split}`).toEqual(productionState);
      expect(visible, `split ${split}`).toBe(expectedProductionVisible);
      expect(result.visibleText, `split ${split}`).toBe(expectedProductionVisible);
    }

    // Deterministic pseudo-random chunking (1..7 chars) so boundaries land
    // inside tags, inside JSON, and on the newline before the closing tag.
    let seed = 42;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed;
    };
    for (let round = 0; round < 50; round += 1) {
      const stream = new OdNextMachineProtocolStream();
      let visible = '';
      let offset = 0;
      while (offset < productionWire.length) {
        const size = 1 + (next() % 7);
        const delta = stream.push(productionWire.slice(offset, offset + size));
        expectNoMachineLeak(delta);
        visible += delta;
        offset += size;
      }
      const result = stream.finish();
      expect(result.issues, `round ${round}`).toEqual([]);
      expect(result.runtimeState, `round ${round}`).toEqual(productionState);
      expect(visible, `round ${round}`).toBe(expectedProductionVisible);
    }
  });

  it('keeps the recovered prose withheld until the real block closes', () => {
    const stream = new OdNextMachineProtocolStream();
    const beforeClose = productionWire.indexOf(`\n</${runtimeTag}>`);
    const early = stream.push(productionWire.slice(0, beforeClose));
    // Nothing after the false opening may stream before the block resolves.
    expect(early).toBe('Handoff summary: design.json is valid, all 5 slides are exported.\n'
      + 'Remaining: then write the final pl reply, and emit `');
    const late = stream.push(productionWire.slice(beforeClose));
    const result = stream.finish();
    expect(early + late).toBe(expectedProductionVisible);
    expect(result.runtimeState).toEqual(productionState);
    expect(result.issues).toEqual([]);
  });

  it('keeps a real line-start Plan Contract that sits inside the recovered prose', () => {
    // The false runtime opening also swallows the real plan block; replaying
    // the recovered prose must capture it as a block, never show its JSON.
    const wire = [
      'Next I will emit `<open-design-runtime-state>` after the plan.',
      'Ready to build.',
      machineBlock(planTag, plan),
      machineBlock(runtimeTag, state),
      'One open decision remains.',
    ].join('\n');
    for (let split = 0; split <= wire.length; split += 1) {
      const stream = new OdNextMachineProtocolStream();
      const visible = stream.push(wire.slice(0, split)) + stream.push(wire.slice(split));
      const result = stream.finish();
      expect(result.issues, `split ${split}`).toEqual([]);
      expect(result.planContract, `split ${split}`).toEqual(plan);
      expect(result.runtimeState, `split ${split}`).toEqual(state);
      expect(visible, `split ${split}`).toBe(
        'Next I will emit `` after the plan.\nReady to build.\n\n\nOne open decision remains.',
      );
      expectNoMachineLeak(visible);
    }
  });

  it('recovers a false Plan Contract opening the same way', () => {
    const wire = [
      'The plan goes into <open-design-plan-contract data-note="x"> as JSON.',
      machineBlock(planTag, plan),
      machineBlock(runtimeTag, state),
    ].join('\n');
    const stream = new OdNextMachineProtocolStream();
    const visible = stream.push(wire);
    const result = stream.finish();
    // The non-exact false wrapper no longer counts as a malformed block once
    // the real block is recovered.
    expect(result.issues).toEqual([]);
    expect(result.planContract).toEqual(plan);
    expect(result.runtimeState).toEqual(state);
    expect(visible).toBe('The plan goes into  as JSON.\n\n');
  });

  it('treats a reserved tag quoted in inline code as prose', () => {
    const wire = [
      'Uwaga techniczna: blok statusu zaczyna sie od `<open-design-runtime-state>` i jest ukryty.',
      'Projekt jest gotowy.',
      machineBlock(runtimeTag, state),
    ].join('\n');
    const stream = new OdNextMachineProtocolStream();
    const visible = stream.push(wire);
    const result = stream.finish();
    expect(result.issues).toEqual([]);
    expect(result.runtimeState).toEqual(state);
    expect(visible).toBe(
      'Uwaga techniczna: blok statusu zaczyna sie od `` i jest ukryty.\nProjekt jest gotowy.\n',
    );
  });

  it('reports the same issue as before when no line-start block can be recovered', () => {
    const wire = [
      'Next I will emit `<open-design-runtime-state>` with the status.',
      'But the real block never arrives, only a broken one:',
      '<open-design-runtime-state>',
      '{"schema":"open-design.strategy-state/v2",',
      '</open-design-runtime-state>',
    ].join('\n');
    for (let split = 0; split <= wire.length; split += 1) {
      const stream = new OdNextMachineProtocolStream();
      const visible = stream.push(wire.slice(0, split)) + stream.push(wire.slice(split));
      const result = stream.finish();
      expect(visible, `split ${split}`).toBe('Next I will emit `');
      expect(result.runtimeState, `split ${split}`).toBeUndefined();
      expect(result.issues.map((issue) => issue.code), `split ${split}`).toEqual([
        'od_next_protocol_runtime_state_invalid_json',
      ]);
    }
  });

  it('does not recover when the whole body is prose without a line-start opening', () => {
    const stream = new OdNextMachineProtocolStream();
    const visible = stream.push([
      'Status goes in <open-design-runtime-state> which I forgot to write.',
      'Final reply text.',
      '</open-design-runtime-state>',
    ].join('\n'));
    const result = stream.finish();
    expect(visible).toBe('Status goes in ');
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'od_next_protocol_runtime_state_invalid_json',
    ]);
  });

  it('does not turn a malformed real block that starts with JSON into prose', () => {
    // A real block whose JSON is broken must never be re-emitted as visible
    // text, even if it happens to carry a line-start copy of its own tag.
    const stream = new OdNextMachineProtocolStream();
    const visible = stream.push([
      'summary',
      '<open-design-runtime-state>',
      '{"schema": "open-design.strategy-state/v2", "note": "broken',
      '<open-design-runtime-state>',
      JSON.stringify(state),
      '</open-design-runtime-state>',
    ].join('\n'));
    const result = stream.finish();
    expect(visible).toBe('summary\n');
    expect(result.runtimeState).toBeUndefined();
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'od_next_protocol_runtime_state_invalid_json',
    ]);
  });

  it('still parses a valid block whose opening tag is mid-line', () => {
    const wire = `Gotowe.<${runtimeTag}>\n${JSON.stringify(state)}\n</${runtimeTag}>\nDalej.`;
    for (let split = 0; split <= wire.length; split += 1) {
      const stream = new OdNextMachineProtocolStream();
      const visible = stream.push(wire.slice(0, split)) + stream.push(wire.slice(split));
      const result = stream.finish();
      expect(result.issues, `split ${split}`).toEqual([]);
      expect(result.runtimeState, `split ${split}`).toEqual(state);
      expect(visible, `split ${split}`).toBe('Gotowe.\nDalej.');
    }
  });

  it('keeps suppressing a closing-tag lookalike inside JSON after a recovery', () => {
    const hostile = structuredClone(plan) as unknown as OpenDesignPlanContractV2;
    hostile.taskProfile.goal = 'Never leak </open-design-plan-contract> or \n<open-design-plan-contract> bytes';
    hostile.decisionSummary.goal = hostile.taskProfile.goal;
    const wire = [
      'I will put the plan in `<open-design-plan-contract>` below.',
      machineBlock(planTag, hostile),
      machineBlock(runtimeTag, state),
    ].join('\n');
    for (let split = 0; split <= wire.length; split += 7) {
      const stream = new OdNextMachineProtocolStream();
      const visible = stream.push(wire.slice(0, split)) + stream.push(wire.slice(split));
      const result = stream.finish();
      expect(result.issues, `split ${split}`).toEqual([]);
      expect(result.planContract, `split ${split}`).toEqual(hostile);
      expect(visible, `split ${split}`).toBe('I will put the plan in `` below.\n\n');
      expectNoMachineLeak(visible);
      expect(visible).not.toContain('Never leak');
    }
  });
});
