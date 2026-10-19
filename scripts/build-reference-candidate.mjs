import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import {
  FoodCatalogManifestV1Schema,
  FoodCatalogPayloadV1Schema,
} from '@nutrixx/food-knowledge';
import {
  FOOD_COMPONENTS_V1,
  resolveFoodComponentV1,
} from '@nutrixx/nutrition-engine';
import {
  NextMealRankingRequestSchema,
  rankNextMealCandidatesV1,
  reviewNextMealRankingV1,
} from '@nutrixx/optimizer-engine';
import {
  buildReferenceProjectionV1,
  selectReviewedClaimsV1,
  validateReferenceProposalV1,
} from '../packages/reference-quality/dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultCatalog = path.join(
  root,
  'apps/web/public/catalog/food-catalog-usda-2026-04-30.1.v1.json.gz',
);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function fileDigest(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function writeImmutable(filename, bytes) {
  try {
    await writeFile(filename, bytes, { flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    if (!(await readFile(filename)).equals(bytes))
      throw new Error(`An immutable candidate file differs: ${filename}`);
  }
}

function catalogFacts(payload) {
  const latest = new Map();
  for (const food of payload.foods) {
    if ((latest.get(food.foodId)?.revision ?? 0) < food.revision)
      latest.set(food.foodId, food);
  }
  const sourceById = new Map(
    payload.sources.map((source) => [source.sourceId, source]),
  );
  const facts = new Map();
  for (const food of latest.values()) facts.set(food.foodId, new Map());
  for (const observation of payload.composition) {
    const food = latest.get(observation.foodId);
    if (!food || food.revision !== observation.foodRevision) continue;
    const value = observation.value;
    if (value.state !== 'known' || value.basis !== 'per-100-gram-edible')
      continue;
    const componentId = resolveFoodComponentV1(
      observation.nutrientId,
      value.unit.code,
    );
    if (componentId === null) continue;
    const foodFacts = facts.get(food.foodId);
    const previous = foodFacts.get(componentId);
    if (previous?.state === 'unknown') continue;
    if (
      previous &&
      (previous.amount !== value.amount ||
        previous.unit.code !== value.unit.code)
    ) {
      foodFacts.set(componentId, {
        state: 'unknown',
        reasonCode: 'ambiguous-composition',
      });
      continue;
    }
    const source = sourceById.get(food.sourceId);
    if (!source) throw new TypeError('A catalog food has no declared source.');
    foodFacts.set(componentId, {
      state: 'known',
      amount: value.amount,
      unit: value.unit,
      source: {
        kind: 'dataset',
        sourceId: food.sourceId,
        sourceVersion: source.sourceRelease,
        sourceRecordId: source.sourceRecordId,
        licenseId: source.licenseId,
      },
    });
  }
  return { latest, facts };
}

function injectCatalogFacts(raw, catalog, releaseId, overrides) {
  const request = NextMealRankingRequestSchema.parse(raw);
  const entries = request.candidates.entries.map((entry) => {
    if (entry.reference.kind !== 'food') return entry;
    const { foodId, foodRevision, catalogReleaseId } = entry.reference;
    const food = catalog.latest.get(foodId);
    if (
      !food ||
      food.revision !== foodRevision ||
      catalogReleaseId !== releaseId
    )
      throw new TypeError(
        `Replay case references a food outside the pinned latest catalog: ${foodId}`,
      );
    const nutrients = new Map(catalog.facts.get(foodId));
    for (const item of overrides.get(foodId) ?? []) {
      nutrients.set(
        item.componentId,
        item.value.state === 'known'
          ? {
              state: 'known',
              amount: item.value.amount,
              unit: item.value.unit,
              source: {
                kind: 'dataset',
                sourceId: item.provenance.sourceId,
                sourceVersion: item.provenance.sourceSha256,
                sourceRecordId: item.provenance.locator,
              },
            }
          : { state: 'unknown', reasonCode: item.value.reason },
      );
    }
    return {
      ...entry,
      nutrientsPer100EdibleGrams: [...nutrients.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([nutrientId, value]) =>
          value.state === 'known'
            ? {
                state: 'known',
                nutrientId,
                amountPer100EdibleGrams: value.amount,
                unit: value.unit,
                source: value.source,
              }
            : { state: 'unknown', nutrientId, reasonCode: value.reasonCode },
        ),
    };
  });
  return { ...request, candidates: { ...request.candidates, entries } };
}

function replayCases(rawCorpus, catalog, releaseId, projection) {
  if (
    rawCorpus?.format !== 'nutrixx.reference-replay-corpus' ||
    rawCorpus.schemaVersion !== 1 ||
    typeof rawCorpus.corpusId !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(rawCorpus.corpusId) ||
    !Array.isArray(rawCorpus.cases) ||
    rawCorpus.cases.length === 0 ||
    rawCorpus.cases.length > 100
  )
    throw new TypeError(
      'The replay corpus needs 1–100 identified next-meal cases.',
    );
  const baseline = new Map();
  const overrides = new Map();
  for (const item of projection.foodComposition)
    overrides.set(item.foodId, [...(overrides.get(item.foodId) ?? []), item]);
  const seen = new Set();
  const coveredFoodIds = new Set();
  const cases = rawCorpus.cases.map((item) => {
    if (
      typeof item.caseId !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(item.caseId) ||
      seen.has(item.caseId)
    )
      throw new TypeError('Replay case IDs must be unique and stable.');
    seen.add(item.caseId);
    for (const entry of item.request?.candidates?.entries ?? [])
      if (entry.reference?.kind === 'food')
        coveredFoodIds.add(entry.reference.foodId);
    const beforeInput = injectCatalogFacts(
      item.request,
      catalog,
      releaseId,
      baseline,
    );
    const afterInput = injectCatalogFacts(
      item.request,
      catalog,
      releaseId,
      overrides,
    );
    const before = rankNextMealCandidatesV1(beforeInput);
    const after = rankNextMealCandidatesV1(afterInput);
    const beforeReview = reviewNextMealRankingV1(beforeInput, before);
    const afterReview = reviewNextMealRankingV1(afterInput, after);
    if (beforeReview.status !== 'APPROVED' || afterReview.status !== 'APPROVED')
      throw new TypeError(`Independent ranking review failed: ${item.caseId}.`);
    return {
      caseId: item.caseId,
      before: {
        resultSha256: digest(JSON.stringify(before)),
        firstChoice: before.ranked[0]?.candidateKey ?? null,
        comparable: before.ranked.length,
        evidenceLimited: before.counts.EVIDENCE_LIMITED,
      },
      after: {
        resultSha256: digest(JSON.stringify(after)),
        firstChoice: after.ranked[0]?.candidateKey ?? null,
        comparable: after.ranked.length,
        evidenceLimited: after.counts.EVIDENCE_LIMITED,
      },
    };
  });
  return { cases, coveredFoodIds };
}

/** Produce local, immutable, inactive candidate artifacts. No network or active-data writes. */
export async function buildReferenceCandidateV1({
  runPath,
  reviewPath,
  corpusPath,
  catalogPath = defaultCatalog,
  outputPath = path.dirname(runPath),
}) {
  const [runBytes, reviewBytes, corpusBytes, compressed] = await Promise.all([
    readFile(runPath),
    readFile(reviewPath),
    readFile(corpusPath),
    readFile(catalogPath),
  ]);
  const run = JSON.parse(runBytes.toString('utf8'));
  if (
    run.format !== 'nutrixx.reference-intake-result' ||
    run.schemaVersion !== 1 ||
    !/^[a-f0-9]{64}$/u.test(run.runId ?? '') ||
    !Array.isArray(run.proposed) ||
    !Array.isArray(run.quarantined) ||
    run.quarantined.length !== 0
  )
    throw new TypeError('A candidate requires a fully validated staged run.');
  const workbench = path.dirname(path.resolve(runPath));
  for (const [field, prefix, suffix] of [
    ['source', 'source-', '.bin'],
    ['proposal', 'proposal-', '.json'],
  ]) {
    const sha = run.evidence?.[`${field}Sha256`];
    const relative = run.evidence?.[`${field}Path`];
    if (
      !/^[a-f0-9]{64}$/u.test(sha ?? '') ||
      relative !== `${prefix}${sha}${suffix}` ||
      (await fileDigest(path.join(workbench, relative))) !== sha
    )
      throw new TypeError(
        `The staged ${field} evidence is missing or changed.`,
      );
  }
  if (
    digest(
      `${run.evidence.proposalSha256}:${run.evidence.sourceSha256}:${run.evidence.catalogSha256}`,
    ) !== run.runId
  )
    throw new TypeError('The staged run identity differs from its evidence.');
  const review = JSON.parse(reviewBytes.toString('utf8'));
  if (review.reviewerId === run.proposal?.extraction?.operatorId)
    throw new TypeError('The reviewer must be independent of the extractor.');
  const accepted = selectReviewedClaimsV1(run.runId, run.proposed, review);
  if (accepted.length === 0)
    throw new TypeError('A candidate needs at least one accepted claim.');
  const release = JSON.parse(gunzipSync(compressed).toString('utf8'));
  if (release.format !== 'nutrixx.reference-release')
    throw new TypeError('The local catalog is not a reference release.');
  const manifest = FoodCatalogManifestV1Schema.parse(release.manifest);
  const payload = FoodCatalogPayloadV1Schema.parse(release.payload);
  const catalogSha256 = digest(compressed);
  if (
    release.releaseId !== manifest.releaseId ||
    manifest.counts.foods !== payload.foods.length ||
    manifest.counts.compositionObservations !== payload.composition.length ||
    manifest.releaseId !== run.evidence.catalogReleaseId ||
    catalogSha256 !== run.evidence.catalogSha256
  )
    throw new TypeError('The staged run targets another catalog.');
  const originalProposal = JSON.parse(
    await readFile(path.join(workbench, run.evidence.proposalPath), 'utf8'),
  );
  const validated = validateReferenceProposalV1(originalProposal, {
    sourceSha256: run.evidence.sourceSha256,
    catalog: { releaseId: manifest.releaseId, artifactSha256: catalogSha256 },
    foodIds: new Set(payload.foods.map((food) => food.foodId)),
    components: FOOD_COMPONENTS_V1,
  });
  if (
    JSON.stringify(validated.proposed) !== JSON.stringify(run.proposed) ||
    JSON.stringify(validated.quarantined) !== JSON.stringify(run.quarantined) ||
    JSON.stringify(validated.proposal) !== JSON.stringify(run.proposal)
  )
    throw new TypeError('The staged run differs from its validated proposal.');
  const projection = buildReferenceProjectionV1(
    { releaseId: manifest.releaseId, sha256: catalogSha256 },
    run.runId,
    accepted,
  );
  const corpus = JSON.parse(corpusBytes.toString('utf8'));
  const { cases, coveredFoodIds } = replayCases(
    corpus,
    catalogFacts(payload),
    manifest.releaseId,
    projection,
  );
  const unsupported = [
    ...projection.cookingRetention.map((item) => item.claimKey),
    ...projection.cookingYield.map((item) => item.claimKey),
    ...projection.intakeReferences.map((item) => item.claimKey),
  ];
  const regressions = cases
    .filter(
      (item) =>
        item.after.evidenceLimited > item.before.evidenceLimited ||
        item.after.comparable < item.before.comparable,
    )
    .map((item) => item.caseId);
  const uncovered = accepted
    .filter(
      (item) =>
        item.claim.kind === 'food-composition' &&
        !coveredFoodIds.has(item.claim.foodId),
    )
    .map((item) => item.claimKey);
  const report = {
    format: 'nutrixx.reference-replay-report',
    schemaVersion: 1,
    corpusId: corpus.corpusId,
    corpusSha256: digest(corpusBytes),
    runId: run.runId,
    reviewSha256: digest(reviewBytes),
    evaluatedCases: cases.length,
    cases,
    unsupportedClaimKeys: unsupported,
    uncoveredClaimKeys: uncovered,
    regressionCaseIds: regressions,
    status:
      unsupported.length || uncovered.length || regressions.length
        ? 'BLOCKED'
        : 'REPLAYED',
  };
  const projectionBytes = Buffer.from(`${JSON.stringify(projection)}\n`);
  const projectionSha256 = digest(projectionBytes);
  const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
  const reportSha256 = digest(reportBytes);
  const candidateId = digest(
    `${catalogSha256}:${run.runId}:${digest(reviewBytes)}:${digest(corpusBytes)}`,
  );
  const candidate = {
    format: 'nutrixx.reference-candidate-manifest',
    schemaVersion: 1,
    candidateId,
    activation: 'inactive',
    status: report.status,
    baseCatalog: projection.baseCatalog,
    reviewedRunId: run.runId,
    reviewedClaimCount: accepted.length,
    projection: {
      file: `projection-${projectionSha256}.json`,
      sha256: projectionSha256,
      bytes: projectionBytes.length,
    },
    replay: {
      file: `replay-${reportSha256}.json`,
      sha256: reportSha256,
      bytes: reportBytes.length,
    },
  };
  const destination = path.resolve(outputPath);
  if (!(await stat(destination)).isDirectory())
    throw new TypeError(
      'Candidate output must be an existing local directory.',
    );
  await writeImmutable(
    path.join(destination, candidate.projection.file),
    projectionBytes,
  );
  await writeImmutable(
    path.join(destination, candidate.replay.file),
    reportBytes,
  );
  const manifestPath = path.join(destination, `candidate-${candidateId}.json`);
  await writeImmutable(
    manifestPath,
    Buffer.from(`${JSON.stringify(candidate, null, 2)}\n`),
  );
  return { candidate, report, manifestPath };
}

function argumentValue(flag) {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: npm run reference:candidate -- --run <run.json> --review <review.json> --corpus <corpus.json> [--catalog <catalog.gz>]',
    );
  } else {
    const runPath = argumentValue('--run');
    const reviewPath = argumentValue('--review');
    const corpusPath = argumentValue('--corpus');
    if (!runPath || !reviewPath || !corpusPath)
      throw new TypeError(
        '--run, --review, and --corpus are required local files.',
      );
    const result = await buildReferenceCandidateV1({
      runPath,
      reviewPath,
      corpusPath,
      ...(argumentValue('--catalog')
        ? { catalogPath: argumentValue('--catalog') }
        : {}),
    });
    console.log(`Inactive candidate: ${result.manifestPath}`);
    console.log(
      `Replay: ${result.report.status}; ${result.report.evaluatedCases} cases; ${result.report.regressionCaseIds.length} regressions; ${result.report.uncoveredClaimKeys.length} uncovered claims; ${result.report.unsupportedClaimKeys.length} unsupported claim kinds.`,
    );
    if (result.report.status !== 'REPLAYED') process.exitCode = 2;
  }
}
