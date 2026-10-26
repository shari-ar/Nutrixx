import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAgentCurationTaskPacketV1,
  parseAgentCurationFoodNames,
} from './create-agent-curation-packet.mjs';

const digest = 'a'.repeat(64);
const queue = {
  format: 'nutrixx.reference-work-queue',
  schemaVersion: 1,
  releaseId: 'catalog-1',
  artifactSha256: digest,
  components: [
    {
      componentId: 'nutrient.protein',
      name: 'Protein',
      category: 'Macronutrient',
      unit: 'g',
    },
  ],
  items: [
    {
      foodName: 'Egg, whole, cooked',
      descriptions: ['Egg, whole, cooked', 'Cooked whole egg'],
      foodRevision: 2,
      preparationStates: ['cooked'],
      sourceRecordId: '1001',
      gap: { subject: { foodId: 'egg-id' } },
      absentComponentIds: ['nutrient.protein'],
      explicitlyUnknownComponentIds: [],
      unitIncompatibleComponentIds: [],
    },
  ],
};

test('parses newline text and JSON name files', () => {
  assert.deepEqual(
    parseAgentCurationFoodNames('Egg, whole, cooked\nfood-id\n'),
    ['Egg, whole, cooked', 'food-id'],
  );
  assert.deepEqual(
    parseAgentCurationFoodNames('["Egg, whole, cooked", "food-id"]'),
    ['Egg, whole, cooked', 'food-id'],
  );
});

test('creates an agent packet from an exact food name', () => {
  const packet = buildAgentCurationTaskPacketV1({
    names: ['Cooked whole egg'],
    queue,
    activeCatalog: { releaseId: 'catalog-1', artifactSha256: digest },
    instructionSha256: 'b'.repeat(64),
    generatedAt: '2026-10-25T12:00:00.000Z',
    batchId: 'batch-1',
    agentId: 'agent-1',
    model: 'model-1',
  });
  assert.equal(packet.targets.length, 1);
  assert.deepEqual(packet.targets[0], {
    foodId: 'egg-id',
    foodRevision: 2,
    preparationStates: ['cooked'],
    descriptions: ['Egg, whole, cooked', 'Cooked whole egg'],
    requestedComponentIds: ['nutrient.protein'],
  });
  assert.equal(packet.components[0].unit.code, 'g');
});

test('rejects ambiguous partial food names', () => {
  assert.throws(
    () =>
      buildAgentCurationTaskPacketV1({
        names: ['egg'],
        queue: {
          ...queue,
          items: [
            ...queue.items,
            {
              ...queue.items[0],
              foodName: 'Egg, whole, raw',
              descriptions: ['Egg, whole, raw'],
              sourceRecordId: '1002',
              gap: { subject: { foodId: 'raw-egg-id' } },
            },
          ],
        },
        activeCatalog: { releaseId: 'catalog-1', artifactSha256: digest },
        instructionSha256: 'b'.repeat(64),
        generatedAt: '2026-10-25T12:00:00.000Z',
        batchId: 'batch-1',
        agentId: 'agent-1',
        model: 'model-1',
      }),
    /ambiguous/u,
  );
});
