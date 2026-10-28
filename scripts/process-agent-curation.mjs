import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

import {
  NUTRIXX_FALLBACK_PROVIDER_V1,
  createFoodCatalogReleaseV1,
  deriveFoodCatalogManifestV1,
  FoodCatalogPayloadV1Schema,
} from '../packages/food-knowledge/dist/index.js';
import {
  resolveFoodComponentV1,
  FOOD_COMPONENTS_V1,
} from '../packages/nutrition-engine/dist/index.js';
import {
  AgentCuratedFoodCompositionRecordV1Schema,
  agentFoodCompositionClaimKeyV1,
  validateAgentCurationBatchV1,
} from '../packages/reference-quality/dist/index.js';
import {
  activateLocalCatalogDraftV1,
  atomicJson,
  ensureLocalCatalogCurationSessionV1,
  localCatalogDraftPaths,
  sha256,
} from './local-catalog-draft.mjs';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

function deterministicId(kind, value) {
  const hex = sha256(`nutrixx:agent-curation:v1:${kind}:${value}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function agentEvidenceProjection(record) {
  const { evidence } = record.claim;
  const common = {
    evidenceType: evidence.evidenceType,
    agentId: record.agent.agentId,
    model: record.agent.model,
    generatedAt: record.generatedAt,
    ...(evidence.note ? { note: evidence.note } : {}),
  };
  if (evidence.evidenceType === 'external-source')
    return {
      sourceReference:
        evidence.sourceUrl ?? `${evidence.sourceTitle} · ${evidence.locator}`,
      licenseId: evidence.licenseId ?? 'LicenseRef-Agent-Reported-Source',
      retrievedAt: evidence.retrievedAt ?? record.generatedAt,
      derivationCode: `nutrixx-agent-${evidence.method}`,
      agentProvenance: {
        ...common,
        method: evidence.method,
        sourceTitle: evidence.sourceTitle,
        ...(evidence.publisher ? { publisher: evidence.publisher } : {}),
        ...(evidence.sourceUrl ? { sourceUrl: evidence.sourceUrl } : {}),
        ...(evidence.sourceEdition
          ? { sourceEdition: evidence.sourceEdition }
          : {}),
        locator: evidence.locator,
        ...(evidence.sourceContentSha256
          ? { sourceContentSha256: evidence.sourceContentSha256 }
          : {}),
      },
    };
  if (evidence.evidenceType === 'model-knowledge')
    return {
      sourceReference: `Model Knowledge · ${record.agent.model}`,
      licenseId: 'LicenseRef-Nutrixx-Model-Knowledge',
      retrievedAt: record.generatedAt,
      derivationCode: 'nutrixx-agent-model-knowledge',
      agentProvenance: {
        ...common,
        knowledgeDescription: evidence.knowledgeDescription,
      },
    };
  return {
    sourceReference: `Agent-derived · ${record.agent.model}`,
    licenseId: 'LicenseRef-Nutrixx-Agent-Derived',
    retrievedAt: record.generatedAt,
    derivationCode: `nutrixx-agent-${evidence.method}`,
    agentProvenance: {
      ...common,
      method: evidence.method,
      derivation: evidence.derivation,
      inputs: evidence.inputs,
    },
  };
}

async function loadCuratedClaims(claimsPath) {
  const raw = JSON.parse(await readFile(claimsPath, 'utf8'));
  if (
    raw.format !== 'nutrixx.agent-curated-food-composition' ||
    raw.schemaVersion !== 1 ||
    !Array.isArray(raw.claims)
  )
    throw new TypeError('The Nutrixx curated claim store is invalid.');
  return raw.claims.map((record) =>
    AgentCuratedFoodCompositionRecordV1Schema.parse(record),
  );
}

function componentKey(foodId, foodRevision, preparationState, componentId) {
  return [foodId, foodRevision, preparationState, componentId].join(':');
}

function latestFoods(payload) {
  const latest = new Map();
  for (const food of payload.foods) {
    if ((latest.get(food.foodId)?.revision ?? 0) < food.revision)
      latest.set(food.foodId, food);
  }
  return latest;
}

function externalKnownComponents(payload) {
  const sources = new Map(
    payload.sources.map((source) => [source.sourceId, source]),
  );
  const known = new Set();
  for (const observation of payload.composition) {
    if (observation.value.state !== 'known') continue;
    const source = sources.get(observation.sourceId);
    if (!source || source.provider === NUTRIXX_FALLBACK_PROVIDER_V1) continue;
    const componentId = resolveFoodComponentV1(
      observation.nutrientId,
      observation.value.unit.code,
    );
    if (!componentId) continue;
    known.add(
      componentKey(
        observation.foodId,
        observation.foodRevision,
        observation.preparationState,
        componentId,
      ),
    );
  }
  return known;
}

function withoutPreviousFallback(payload) {
  const fallbackSourceIds = new Set(
    payload.sources
      .filter((source) => source.provider === NUTRIXX_FALLBACK_PROVIDER_V1)
      .map((source) => source.sourceId),
  );
  return {
    ...payload,
    sources: payload.sources.filter(
      (source) => !fallbackSourceIds.has(source.sourceId),
    ),
    composition: payload.composition.filter(
      (observation) => !fallbackSourceIds.has(observation.sourceId),
    ),
  };
}

function mergeClaims(previous, incoming, metadata) {
  const merged = new Map(
    previous.map((record) => [
      agentFoodCompositionClaimKeyV1(record.claim),
      record,
    ]),
  );
  for (const claim of incoming)
    merged.set(agentFoodCompositionClaimKeyV1(claim), {
      claim,
      batchId: metadata.batchId,
      generatedAt: metadata.generatedAt,
      submittedAgainst: metadata.catalog,
      agent: metadata.agent,
    });
  return [...merged.values()].sort((left, right) =>
    agentFoodCompositionClaimKeyV1(left.claim).localeCompare(
      agentFoodCompositionClaimKeyV1(right.claim),
      'en',
    ),
  );
}

export async function processAgentCurationRunV1({
  runId,
  rootPath = projectRoot,
  deferCompletion = false,
}) {
  if (!/^[a-f0-9-]{36}$/u.test(runId))
    throw new TypeError('The curation run identifier is invalid.');
  const draftPaths = localCatalogDraftPaths(rootPath);
  const claimsPath = draftPaths.claims;
  const runDirectory = path.join(
    rootPath,
    'reference-workbench/agent-curation/runs',
    runId,
  );
  const inputPath = path.join(runDirectory, 'input.json');
  const statusPath = path.join(runDirectory, 'status.json');
  const writeStatus = (status) =>
    atomicJson(statusPath, {
      format: 'nutrixx.agent-curation-run',
      schemaVersion: 1,
      runId,
      ...status,
    });

  await writeStatus({ status: 'running', startedAt: new Date().toISOString() });
  try {
    const session = await ensureLocalCatalogCurationSessionV1({ rootPath });
    const descriptor = session.baseCatalog;
    const input = JSON.parse(await readFile(inputPath, 'utf8'));
    const catalogPath = path.join(
      rootPath,
      'apps/web/public/catalog',
      descriptor.artifactName,
    );
    const compressedBase = await readFile(catalogPath);
    if (
      sha256(compressedBase) !== descriptor.artifactSha256 ||
      compressedBase.length !== descriptor.compressedByteLength
    )
      throw new TypeError('The pinned catalog artifact failed verification.');
    const baseRelease = JSON.parse(gunzipSync(compressedBase).toString('utf8'));
    const basePayload = FoodCatalogPayloadV1Schema.parse(baseRelease.payload);
    const intake = validateAgentCurationBatchV1(input, {
      catalog: {
        releaseId: descriptor.releaseId,
        artifactSha256: descriptor.artifactSha256,
      },
      foods: basePayload.foods,
      components: FOOD_COMPONENTS_V1,
    });

    const previousClaims = await loadCuratedClaims(claimsPath);
    const curatedClaims = mergeClaims(
      previousClaims,
      intake.accepted,
      intake.metadata,
    );
    const latest = latestFoods(basePayload);
    const externalKnown = externalKnownComponents(basePayload);
    const projected = [];
    const shadowed = [];
    const stale = [];
    for (const record of curatedClaims) {
      const { claim } = record;
      const food = latest.get(claim.foodId);
      if (
        !food ||
        food.revision !== claim.foodRevision ||
        !food.preparationStates.includes(claim.preparationState)
      ) {
        stale.push({
          claimId: claim.claimId,
          reason: 'The claim no longer targets the latest catalog food.',
        });
        continue;
      }
      const key = componentKey(
        claim.foodId,
        claim.foodRevision,
        claim.preparationState,
        claim.componentId,
      );
      if (externalKnown.has(key))
        shadowed.push({ claimId: claim.claimId, key });
      else projected.push(record);
    }

    const baseWithoutFallback = withoutPreviousFallback(basePayload);
    const projectedKeys = new Set(
      projected.map(({ claim }) =>
        componentKey(
          claim.foodId,
          claim.foodRevision,
          claim.preparationState,
          claim.componentId,
        ),
      ),
    );
    const retainedComposition = baseWithoutFallback.composition.filter(
      (observation) => {
        const componentId =
          observation.value.state === 'known'
            ? resolveFoodComponentV1(
                observation.nutrientId,
                observation.value.unit.code,
              )
            : FOOD_COMPONENTS_V1.find(
                (component) =>
                  component.componentId === observation.nutrientId ||
                  component.usdaFdcNutrientIds.some(
                    (sourceId) =>
                      `source.usda-fdc.${sourceId}` === observation.nutrientId,
                  ),
              )?.componentId;
        return (
          !componentId ||
          !projectedKeys.has(
            componentKey(
              observation.foodId,
              observation.foodRevision,
              observation.preparationState,
              componentId,
            ),
          )
        );
      },
    );
    const addedSources = [];
    const addedObservations = [];
    const lineage = [];
    for (const record of projected) {
      const { claim } = record;
      const component = FOOD_COMPONENTS_V1.find(
        (item) => item.componentId === claim.componentId,
      );
      if (!component) throw new TypeError('A projected component disappeared.');
      const sourceId = deterministicId('source', claim.claimId);
      const observationId = deterministicId('observation', claim.claimId);
      const evidenceProjection = agentEvidenceProjection(record);
      addedSources.push({
        sourceId,
        provider: NUTRIXX_FALLBACK_PROVIDER_V1,
        dataset: 'agent-curated-food-composition',
        sourceRelease: record.batchId,
        sourceRecordId: claim.claimId,
        sourceReference: evidenceProjection.sourceReference,
        licenseId: evidenceProjection.licenseId,
        retrievedAt: evidenceProjection.retrievedAt,
        agentProvenance: evidenceProjection.agentProvenance,
      });
      addedObservations.push({
        observationId,
        foodId: claim.foodId,
        foodRevision: claim.foodRevision,
        nutrientId: claim.componentId,
        sourceNutrientId: claim.componentId,
        sourceNutrientName: component.name,
        derivationCode: evidenceProjection.derivationCode,
        preparationState: claim.preparationState,
        value: { state: 'known', ...claim.value },
        sourceId,
        quality: [],
      });
      lineage.push({
        claimId: claim.claimId,
        observationId,
        sourceId,
        batchId: record.batchId,
        generatedAt: record.generatedAt,
        submittedAgainst: record.submittedAgainst,
        agent: record.agent,
        evidence: claim.evidence,
      });
    }

    const canonicalClaims = {
      format: 'nutrixx.agent-curated-food-composition',
      schemaVersion: 1,
      claims: curatedClaims,
    };
    const claimsSha256 = sha256(JSON.stringify(canonicalClaims));
    const releaseId = `food-catalog-nutrixx-${sha256(
      `${descriptor.artifactSha256}:${claimsSha256}`,
    ).slice(0, 24)}`;
    const payload = FoodCatalogPayloadV1Schema.parse({
      ...baseWithoutFallback,
      sources: [...baseWithoutFallback.sources, ...addedSources],
      composition: [...retainedComposition, ...addedObservations],
    });
    const sourceDatasets = baseRelease.manifest.sourceDatasets.filter(
      (dataset) => dataset.provider !== NUTRIXX_FALLBACK_PROVIDER_V1,
    );
    if (addedObservations.length > 0)
      sourceDatasets.push({
        provider: NUTRIXX_FALLBACK_PROVIDER_V1,
        dataset: 'agent-curated-food-composition',
        sourceRelease: claimsSha256.slice(0, 24),
        licenseId: 'LicenseRef-Nutrixx-Curated-Data',
        homepage: 'https://github.com/shari-ar/Nutrixx',
      });
    const manifest = deriveFoodCatalogManifestV1(
      {
        ...baseRelease.manifest,
        releaseId,
        publishedAt: intake.metadata.generatedAt,
        sourceDatasets,
        quality: {
          ...baseRelease.manifest.quality,
          sourceEntries:
            baseRelease.manifest.quality.sourceEntries + addedSources.length,
          sourceComponents:
            baseRelease.manifest.quality.sourceComponents +
            addedObservations.length,
        },
        counts: undefined,
        coverage: undefined,
      },
      payload,
    );
    const release = await createFoodCatalogReleaseV1({
      manifest,
      payload,
      hash: async (value) => sha256(value),
    });
    const artifact = gzipSync(JSON.stringify(release), { level: 9 });
    const artifactName = `${releaseId}.v1.json.gz`;
    const receiptName = `${releaseId}.receipt.json`;
    const receipt = {
      format: 'nutrixx.agent-curated-catalog-receipt',
      schemaVersion: 1,
      releaseId,
      artifact: artifactName,
      compressedByteLength: artifact.length,
      artifactSha256: sha256(artifact),
      baseCatalog: {
        releaseId: descriptor.releaseId,
        artifactSha256: descriptor.artifactSha256,
      },
      claimsSha256,
      acceptedInRun: intake.accepted.length,
      quarantinedInRun: intake.quarantined,
      curatedClaimCount: curatedClaims.length,
      projectedClaimCount: projected.length,
      shadowedClaimCount: shadowed.length,
      staleClaimCount: stale.length,
      lineage,
    };
    const catalogDirectory = path.join(rootPath, 'apps/web/public/catalog');
    await mkdir(catalogDirectory, { recursive: true });
    await Promise.all([
      atomicJson(claimsPath, canonicalClaims),
      writeFile(path.join(runDirectory, artifactName), artifact),
      atomicJson(path.join(runDirectory, receiptName), receipt),
      writeFile(path.join(catalogDirectory, artifactName), artifact),
      atomicJson(path.join(catalogDirectory, receiptName), receipt),
      atomicJson(path.join(runDirectory, 'report.json'), {
        ...receipt,
        shadowed,
        stale,
      }),
    ]);
    const draftDescriptor = {
      ...descriptor,
      releaseId,
      artifactName,
      artifactSha256: receipt.artifactSha256,
      compressedByteLength: receipt.compressedByteLength,
      artifactUrl: null,
      receiptUrl: null,
      candidateId: runId,
      reviewedClaimCount: curatedClaims.length,
    };
    const updatedSession = await activateLocalCatalogDraftV1({
      rootPath,
      session,
      descriptor: draftDescriptor,
    });
    const completed = {
      status: 'completed',
      completedAt: new Date().toISOString(),
      publicationState: 'local-draft',
      sessionId: updatedSession.sessionId,
      draftId: draftDescriptor.candidateId,
      draftRevision: updatedSession.draftRevision,
      baseReleaseId: updatedSession.baseCatalog.releaseId,
      releaseId,
      artifact: path.relative(rootPath, path.join(runDirectory, artifactName)),
      receipt: path.relative(rootPath, path.join(runDirectory, receiptName)),
      report: path.relative(rootPath, path.join(runDirectory, 'report.json')),
      acceptedClaimCount: intake.accepted.length,
      quarantinedClaimCount: intake.quarantined.length,
      projectedClaimCount: projected.length,
      shadowedClaimCount: shadowed.length,
      staleClaimCount: stale.length,
    };
    if (!deferCompletion) await writeStatus(completed);
    return completed;
  } catch (error) {
    await writeStatus({
      status: 'failed',
      failedAt: new Date().toISOString(),
      error:
        error instanceof Error ? error.message : 'Unknown curation failure.',
    });
    throw error;
  }
}

function argument(flag) {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const runId = argument('--run-id');
  if (!runId) throw new TypeError('--run-id is required.');
  await processAgentCurationRunV1({ runId });
}
