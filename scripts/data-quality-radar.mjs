import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';

import {
  FoodCatalogManifestV1Schema,
  FoodCatalogPayloadV1Schema,
  auditFoodDataQualityV1,
} from '@nutrixx/food-knowledge';
import {
  FOOD_COMPONENTS_V1,
  getAdultDriBaselineReleaseV1,
} from '@nutrixx/nutrition-engine';
import { buildFoodCompositionWorkQueueV1 } from '../packages/reference-quality/dist/index.js';

import { renderReferenceWorkQueueHtml } from './render-reference-work-queue.mjs';
import {
  emptyFoodIdentityReview,
  renderFoodIdentityReviewHtml,
} from './render-food-identity-review.mjs';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const activeConfigPath = path.join(
  projectRoot,
  'apps/web/config/active-food-catalog.json',
);
const outputDirectory = path.join(projectRoot, '.temp/data-quality-radar');
const unzip = promisify(gunzip);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, (character) => {
    const replacements = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return replacements[character];
  });
}

function ratio(numerator, denominator) {
  return denominator === 0
    ? 'Unknown'
    : `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function card(label, value, detail) {
  return `<section class="card"><h2>${escapeHtml(label)}</h2><strong>${escapeHtml(value)}</strong><p>${escapeHtml(detail)}</p></section>`;
}

function renderHtml(report, artifact, active) {
  const rows = report.rows
    .map(
      (row) => `<tr data-search="${escapeHtml(
        `${row.name} ${row.accessCode} ${row.category} ${row.componentId}`.toLowerCase(),
      )}">
        <th scope="row">${escapeHtml(row.name)}<small>${escapeHtml(row.accessCode)}</small></th>
        <td>${escapeHtml(row.category)}</td>
        <td>${row.coverageScore === null ? 'Unknown' : `${row.coverageScore}%`}</td>
        <td>${row.knownFoods.toLocaleString('en-US')} / ${report.latestFoods.toLocaleString('en-US')}</td>
        <td>${row.foodsWithKnownValueAndPortion.toLocaleString('en-US')}</td>
        <td>${row.explicitlyUnknownFoods.toLocaleString('en-US')}</td>
        <td>${row.tracedObservations.toLocaleString('en-US')} / ${row.knownObservations.toLocaleString('en-US')}</td>
        <td>${row.methodDocumentedObservations.toLocaleString('en-US')} / ${row.knownObservations.toLocaleString('en-US')}</td>
        <td>${row.explicitlyGradedObservations.toLocaleString('en-US')} / ${row.knownObservations.toLocaleString('en-US')}</td>
        <td>${row.freshSourceObservations.toLocaleString('en-US')} / ${row.knownObservations.toLocaleString('en-US')}</td>
        <td>${row.hasBaselineTarget ? 'Yes' : 'No'}</td>
      </tr>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nutrixx Data Quality Radar</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#0b1421;color:#e7eff6}
body{max-width:1380px;margin:auto;padding:2rem}h1{font-size:clamp(2rem,4vw,3rem);margin:.4rem 0}
p{color:#adbece;line-height:1.5}a{color:#7ddcc8}.eyebrow{color:#7ddcc8;text-transform:uppercase;letter-spacing:.15em;font-size:.8rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:1rem;margin:2rem 0}
.card{background:#152536;border:1px solid #2b4756;border-radius:16px;padding:1rem;min-height:140px}
.card h2{font-size:.9rem;color:#adbece;font-weight:500}.card strong{font-size:2rem}.card p{font-size:.82rem;margin-bottom:0}
.notice{background:#16352f;border-left:4px solid #7ddcc8;padding:1rem;margin:1.5rem 0}
label{display:block;margin:1.5rem 0 .5rem}input{box-sizing:border-box;width:100%;max-width:420px;padding:.8rem;border-radius:8px;border:1px solid #557184;background:#0b1421;color:inherit}
.table-wrap{overflow:auto;border:1px solid #2b4756;border-radius:12px}table{border-collapse:collapse;width:100%;min-width:950px}th,td{text-align:left;padding:.7rem;border-bottom:1px solid #2b4756}thead th{background:#1e3446;position:sticky;top:0}tbody tr:hover{background:#1b3041}tbody th{font-weight:600}small{display:block;color:#9cbbca;font-weight:400}
footer{margin:2rem 0;color:#9cbbca;font-size:.85rem}
</style></head><body>
<p class="eyebrow">Internal / local artifact audit</p><h1>Data Quality Radar</h1>
<p><a href="/queue">Open the Reference Work Queue</a> · <a href="/identity-review">Open Food Identity Review</a></p>
<p>Catalog ${escapeHtml(report.releaseId)} · Evaluated ${escapeHtml(report.evaluatedAt)} · ${report.totalComponents} registered components · ${report.latestFoods.toLocaleString('en-US')} latest food records</p>
<p>Publication: ${active.candidateId === null ? 'pinned base catalog' : `reviewed candidate ${escapeHtml(active.candidateId)} · ${active.reviewedClaimCount} reviewed composition claims`}</p>
<div class="notice">This is an operational coverage report, not a measure of health accuracy. Known zero counts as known. Missing and explicitly unknown values never become zero. Catalog-only comparability excludes personal history, restrictions, recipes, and final ranking validation.</div>
<div class="grid">
${card('Coverage score', report.coverageScore === null ? 'Unknown' : `${report.coverageScore}%`, `${report.knownFoodComponentPairs.toLocaleString('en-US')} known of ${report.possibleFoodComponentPairs.toLocaleString('en-US')} possible food–component pairs`)}
${card('Source traceability', ratio(report.tracedObservations, report.knownObservations), 'Known observations linked to a declared source release and license')}
${card('Method detail', ratio(report.methodDocumentedObservations, report.knownObservations), 'Known observations with derivation or data-point metadata')}
${card('Explicit quality grade', ratio(report.explicitlyGradedObservations, report.knownObservations), 'Known observations carrying an explicit quality dimension')}
${card('Source freshness', ratio(report.freshSourceObservations, report.knownObservations), `Source release no older than ${report.freshSourceWindowDays} days; republishing does not reset age`)}
${card('Baseline-set potential', report.catalogComparableFoodsForBaselineSet === null ? 'Unknown' : report.catalogComparableFoodsForBaselineSet.toLocaleString('en-US'), `${report.baselineTargetComponents} mapped baseline components; food needs a portion and all baseline values`)}
</div>
<p>Artifact SHA-256: <code>${escapeHtml(artifact.sha256)}</code>. Receipt: ${escapeHtml(artifact.receiptStatus)}. Source-date unknown observations: ${report.sourceDateUnknownObservations.toLocaleString('en-US')}. Unmapped baseline targets: ${escapeHtml(report.unmappedBaselineTargetIds.join(', ') || 'none')}.</p>
<label for="filter">Filter the 112 components</label><input id="filter" type="search" placeholder="Name, access code, category, or ID">
<div class="table-wrap"><table><thead><tr><th scope="col">Component</th><th scope="col">Category</th><th scope="col">Coverage</th><th scope="col">Known foods</th><th scope="col">Known + portion</th><th scope="col">Explicit unknown</th><th scope="col">Traced observations</th><th scope="col">Method detail</th><th scope="col">Explicit quality grade</th><th scope="col">Recent source observations</th><th scope="col">Baseline target</th></tr></thead><tbody>${rows}</tbody></table></div>
<footer>Radar policy ${escapeHtml(report.radarVersion)}. Scores are observed coverage only; source quality and freshness remain separate indicators. Report and source artifact stay on this computer. <a href="./report.json">Machine-readable report</a>.</footer>
<script>const filter=document.querySelector('#filter');filter.addEventListener('input',()=>{const query=filter.value.trim().toLowerCase();for(const row of document.querySelectorAll('tbody tr'))row.hidden=!row.dataset.search.includes(query)})</script>
</body></html>`;
}

async function loadArtifact(artifactPath) {
  const compressed = await readFile(artifactPath);
  const release = JSON.parse((await unzip(compressed)).toString('utf8'));
  if (release.format !== 'nutrixx.reference-release')
    throw new TypeError('The catalog artifact has the wrong release format.');
  const manifest = FoodCatalogManifestV1Schema.parse(release.manifest);
  const payload = FoodCatalogPayloadV1Schema.parse(release.payload);
  if (
    release.releaseId !== manifest.releaseId ||
    release.publishedAt !== manifest.publishedAt ||
    manifest.counts.sources !== payload.sources.length ||
    manifest.counts.foods !== payload.foods.length ||
    manifest.counts.portions !== payload.portions.length ||
    manifest.counts.compositionObservations !== payload.composition.length
  )
    throw new TypeError(
      'Catalog release and manifest identities or counts differ.',
    );
  const sha256 = createHash('sha256').update(compressed).digest('hex');
  const receiptPath = artifactPath.endsWith('.v1.json.gz')
    ? artifactPath.slice(0, -'.v1.json.gz'.length) + '.receipt.json'
    : `${artifactPath}.receipt.json`;
  let receiptStatus =
    'not available; artifact hash is recorded but not independently verified';
  let identityReview = emptyFoodIdentityReview(
    manifest.releaseId,
    manifest.publishedAt,
  );
  try {
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    if (
      receipt.artifactSha256 !== sha256 ||
      receipt.releaseId !== manifest.releaseId ||
      receipt.compressedByteLength !== compressed.length
    )
      throw new TypeError('The catalog receipt does not match the artifact.');
    if (receipt.identityReview !== undefined) {
      if (
        receipt.identityReview?.format !== 'nutrixx.food-identity-review' ||
        receipt.identityReview.schemaVersion !== 1 ||
        receipt.identityReview.releaseId !== manifest.releaseId ||
        receipt.identityReview.blocksPublication !== false ||
        !Array.isArray(receipt.identityReview.items)
      )
        throw new TypeError('The catalog identity review is invalid.');
      identityReview = receipt.identityReview;
    }
    receiptStatus = 'verified against local release receipt';
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return { manifest, payload, sha256, receiptStatus, identityReview };
}

async function main() {
  const args = process.argv.slice(2);
  const usageOptionIndex = args.indexOf('--consumption-snapshot');
  let consumptionSnapshot;
  if (usageOptionIndex !== -1) {
    const snapshotPath = args[usageOptionIndex + 1];
    if (!snapshotPath || snapshotPath.startsWith('--'))
      throw new TypeError('--consumption-snapshot requires a local JSON path.');
    consumptionSnapshot = JSON.parse(
      await readFile(path.resolve(snapshotPath), 'utf8'),
    );
    args.splice(usageOptionIndex, 2);
  }
  if (args.length > 1 || args.some((arg) => arg.startsWith('--')))
    throw new TypeError(
      'Expected one optional catalog path and one optional consumption snapshot.',
    );
  const active = JSON.parse(await readFile(activeConfigPath, 'utf8'));
  if (
    active.format !== 'nutrixx.active-food-catalog' ||
    active.schemaVersion !== 1 ||
    !/^[a-z0-9][a-z0-9.-]{0,199}$/u.test(active.releaseId ?? '') ||
    active.artifactName !== `${active.releaseId}.v1.json.gz` ||
    !/^[a-f0-9]{64}$/u.test(active.artifactSha256 ?? '')
  )
    throw new TypeError('The active catalog descriptor is invalid.');
  const defaultArtifact = path.join(
    projectRoot,
    'apps/web/public/catalog',
    active.artifactName,
  );
  const artifactPath = path.resolve(args[0] ?? defaultArtifact);
  const { manifest, payload, sha256, receiptStatus, identityReview } =
    await loadArtifact(artifactPath);
  if (
    args[0] === undefined &&
    (manifest.releaseId !== active.releaseId ||
      sha256 !== active.artifactSha256)
  )
    throw new TypeError(
      'The active catalog differs from its pinned descriptor.',
    );
  const baselineTargetIds = getAdultDriBaselineReleaseV1().rules.map(
    (rule) => rule.nutrientId,
  );
  const evaluatedAt = new Date().toISOString();
  const report = auditFoodDataQualityV1({
    manifest,
    payload,
    components: FOOD_COMPONENTS_V1,
    baselineTargetIds,
    evaluatedAt,
  });
  if (report.totalComponents !== 112)
    throw new TypeError(
      'The active food-component registry must contain 112 entries.',
    );
  const sources = new Map(
    payload.sources.map((source) => [source.sourceId, source]),
  );
  const queue = buildFoodCompositionWorkQueueV1({
    releaseId: manifest.releaseId,
    artifactSha256: sha256,
    evaluatedAt,
    foods: payload.foods.map((food) => ({
      foodId: food.foodId,
      revision: food.revision,
      name:
        food.descriptions.find((description) => description.kind === 'primary')
          ?.value ?? food.descriptions[0].value,
      descriptions: food.descriptions.map((description) => description.value),
      preparationStates: food.preparationStates,
      sourceRecordId: sources.get(food.sourceId)?.sourceRecordId ?? food.foodId,
    })),
    observations: payload.composition,
    components: FOOD_COMPONENTS_V1,
    baselineTargetIds,
    consumptionSnapshot,
  });
  await mkdir(outputDirectory, { recursive: true });
  const jsonPath = path.join(outputDirectory, 'report.json');
  const htmlPath = path.join(outputDirectory, 'index.html');
  const queueJsonPath = path.join(outputDirectory, 'queue.json');
  const queueHtmlPath = path.join(outputDirectory, 'queue.html');
  const identityReviewJsonPath = path.join(
    outputDirectory,
    'identity-review.json',
  );
  const identityReviewHtmlPath = path.join(
    outputDirectory,
    'identity-review.html',
  );
  await writeFile(
    jsonPath,
    `${JSON.stringify({ activeRelease: active, artifact: { sha256, receiptStatus }, report }, null, 2)}\n`,
  );
  await writeFile(
    htmlPath,
    renderHtml(report, { sha256, receiptStatus }, active),
  );
  await writeFile(
    queueJsonPath,
    `${JSON.stringify({ ...queue, components: FOOD_COMPONENTS_V1 })}\n`,
  );
  await writeFile(queueHtmlPath, renderReferenceWorkQueueHtml());
  await writeFile(
    identityReviewJsonPath,
    `${JSON.stringify(identityReview, null, 2)}\n`,
  );
  await writeFile(
    identityReviewHtmlPath,
    renderFoodIdentityReviewHtml(identityReview),
  );
  console.log(`Data quality radar: ${htmlPath}`);
  console.log(`Reference work queue: ${queueHtmlPath}`);
  console.log(`Food identity review: ${identityReviewHtmlPath}`);
  console.log(`Machine-readable report: ${jsonPath}`);
  console.log(
    `Coverage score: ${report.coverageScore ?? 'unknown'}%; known pairs: ${report.knownFoodComponentPairs}/${report.possibleFoodComponentPairs}.`,
  );
}

await main();
