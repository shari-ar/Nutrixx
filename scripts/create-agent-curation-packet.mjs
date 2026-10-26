import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

function normalizeName(value) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

export function parseAgentCurationFoodNames(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    if (
      !Array.isArray(parsed) ||
      parsed.some((item) => typeof item !== 'string')
    )
      throw new TypeError(
        'The names JSON file must contain an array of strings.',
      );
    return parsed;
  }
  return trimmed
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values)];
}

function resolveFood(query, items) {
  const normalized = normalizeName(query);
  if (!normalized) throw new TypeError('Food names must not be empty.');
  const candidates = items.map((item) => ({
    item,
    aliases: unique([
      item.foodName,
      ...(item.descriptions ?? []),
      item.gap?.subject?.foodId,
      item.sourceRecordId,
    ]).filter((value) => typeof value === 'string'),
  }));
  const exact = candidates.filter(({ aliases }) =>
    aliases.some((alias) => normalizeName(alias) === normalized),
  );
  if (exact.length === 1) return exact[0].item;
  const partial = candidates.filter(({ aliases }) =>
    aliases.some((alias) => normalizeName(alias).includes(normalized)),
  );
  const matches = exact.length > 0 ? exact : partial;
  if (matches.length === 1) return matches[0].item;
  if (matches.length === 0)
    throw new TypeError(`No incomplete catalog food matches "${query}".`);
  throw new TypeError(
    `Food name "${query}" is ambiguous. Use one exact name or food ID: ${matches
      .slice(0, 8)
      .map(({ item }) => `${item.foodName} [${item.gap.subject.foodId}]`)
      .join('; ')}`,
  );
}

export function buildAgentCurationTaskPacketV1({
  names,
  queue,
  activeCatalog,
  instructionSha256,
  generatedAt,
  batchId,
  agentId,
  model,
}) {
  if (
    queue?.format !== 'nutrixx.reference-work-queue' ||
    queue.schemaVersion !== 1 ||
    queue.releaseId !== activeCatalog.releaseId ||
    queue.artifactSha256 !== activeCatalog.artifactSha256 ||
    !Array.isArray(queue.items) ||
    !Array.isArray(queue.components)
  )
    throw new TypeError(
      'Regenerate the Data Quality Radar for the active catalog.',
    );
  const selected = unique(names).map((name) => resolveFood(name, queue.items));
  const foods = new Map(
    selected.map((item) => [item.gap.subject.foodId, item]),
  );
  const targets = [...foods.values()].map((item) => {
    if (
      !Number.isSafeInteger(item.foodRevision) ||
      item.foodRevision < 1 ||
      !Array.isArray(item.preparationStates) ||
      item.preparationStates.length === 0 ||
      !Array.isArray(item.descriptions)
    )
      throw new TypeError(
        'Regenerate the Data Quality Radar before creating an agent packet.',
      );
    return {
      foodId: item.gap.subject.foodId,
      foodRevision: item.foodRevision,
      preparationStates: item.preparationStates,
      descriptions: item.descriptions,
      requestedComponentIds: unique([
        ...item.absentComponentIds,
        ...item.explicitlyUnknownComponentIds,
        ...item.unitIncompatibleComponentIds,
      ]),
    };
  });
  const requested = new Set(
    targets.flatMap((target) => target.requestedComponentIds),
  );
  const components = queue.components
    .filter((component) => requested.has(component.componentId))
    .map(({ componentId, name, category, unit }) => ({
      componentId,
      name,
      category,
      unit: { system: 'ucum', code: unit },
    }));
  if (components.length !== requested.size)
    throw new TypeError(
      'The work queue does not define every requested component.',
    );
  return {
    format: 'nutrixx.agent-curation-task-packet',
    schemaVersion: 1,
    batchId,
    generatedAt,
    catalog: {
      releaseId: activeCatalog.releaseId,
      artifactSha256: activeCatalog.artifactSha256,
    },
    agent: { agentId, model, instructionSha256 },
    targets,
    components,
    evidenceSources: [],
  };
}

export async function createAgentCurationTaskPacketV1({
  names,
  queuePath = path.join(projectRoot, '.temp/data-quality-radar/queue.json'),
  agentId = 'external-curation-agent',
  model = 'operator-selected-model',
  requestedBatchId,
  generatedAt = new Date().toISOString(),
}) {
  if (!Array.isArray(names) || names.length === 0)
    throw new TypeError('Provide at least one food name or food ID.');
  const promptPath = path.join(
    projectRoot,
    'docs/data/agent-curation-prompt.md',
  );
  const [prompt, checksumText, activeText, queueText] = await Promise.all([
    readFile(promptPath),
    readFile(
      path.join(projectRoot, 'docs/data/agent-curation-prompt.sha256'),
      'utf8',
    ),
    readFile(
      path.join(projectRoot, 'apps/web/config/active-food-catalog.json'),
      'utf8',
    ),
    readFile(path.resolve(queuePath), 'utf8'),
  ]);
  const instructionSha256 = createHash('sha256').update(prompt).digest('hex');
  if (checksumText.trim().split(/\s+/u)[0] !== instructionSha256)
    throw new TypeError('The agent prompt checksum is stale.');
  const nameDigest = createHash('sha256')
    .update(names.map(normalizeName).sort().join('\n'))
    .digest('hex')
    .slice(0, 12);
  const batchId =
    requestedBatchId ??
    `curation-${generatedAt.replace(/[-:.TZ]/gu, '').slice(0, 14)}-${nameDigest}`;
  return {
    prompt,
    packet: buildAgentCurationTaskPacketV1({
      names,
      queue: JSON.parse(queueText),
      activeCatalog: JSON.parse(activeText),
      instructionSha256,
      generatedAt,
      batchId,
      agentId,
      model,
    }),
  };
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--'))
    throw new TypeError(`${name} requires a value.`);
  args.splice(index, 2);
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  const namesFile = option(args, '--names-file');
  const queuePath = path.resolve(
    option(args, '--queue') ?? '.temp/data-quality-radar/queue.json',
  );
  const outputOption = option(args, '--output');
  const agentId = option(args, '--agent-id') ?? 'external-curation-agent';
  const model = option(args, '--model') ?? 'operator-selected-model';
  const requestedBatchId = option(args, '--batch-id');
  if (args.some((arg) => arg.startsWith('--')))
    throw new TypeError(
      `Unknown option: ${args.find((arg) => arg.startsWith('--'))}`,
    );
  const names = [
    ...(namesFile
      ? parseAgentCurationFoodNames(
          await readFile(path.resolve(namesFile), 'utf8'),
        )
      : []),
    ...args,
  ];
  if (names.length === 0)
    throw new TypeError(
      'Provide food names as arguments or with --names-file <text-or-json-file>.',
    );
  const { packet, prompt } = await createAgentCurationTaskPacketV1({
    names,
    queuePath,
    agentId,
    model,
    requestedBatchId,
  });
  const outputDirectory = path.resolve(
    outputOption ?? `.temp/agent-curation-packets/${packet.batchId}`,
  );
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDirectory, 'agent-prompt.md'), prompt),
    writeFile(
      path.join(outputDirectory, 'agent-task-packet.json'),
      `${JSON.stringify(packet, null, 2)}\n`,
    ),
  ]);
  console.log(`Agent prompt: ${path.join(outputDirectory, 'agent-prompt.md')}`);
  console.log(
    `Task packet: ${path.join(outputDirectory, 'agent-task-packet.json')}`,
  );
  console.log(
    `Selected ${packet.targets.length} unique foods and ${packet.components.length} requested components.`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
