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

export function emptyFoodIdentityReview(releaseId, generatedAt) {
  return {
    format: 'nutrixx.food-identity-review',
    schemaVersion: 1,
    releaseId,
    generatedAt,
    blocksPublication: false,
    items: [],
  };
}

export function renderFoodIdentityReviewHtml(review) {
  const rows = review.items
    .map(
      (item) =>
        `<tr><th scope="row">${escapeHtml(item.sourceName)}</th><td>${escapeHtml(item.provider)}</td><td>${escapeHtml(item.sourceRecordId)}</td><td>${escapeHtml(item.reason)}</td><td>${escapeHtml(
          item.candidateSourceRecords
            .map(
              (candidate) =>
                `${candidate.sourceName} (${candidate.provider}:${candidate.sourceRecordId})`,
            )
            .join('; ') || 'None declared',
        )}</td></tr>`,
    )
    .join('\n');
  return `<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nutrixx Food Identity Review</title><style>:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#0b1421;color:#e7eff6}body{max-width:1280px;margin:auto;padding:2rem}p{color:#adbece;line-height:1.5}a{color:#7ddcc8}.notice{background:#152536;border-left:4px solid #e9a75d;border-radius:12px;padding:1rem;margin:1.5rem 0}.table-wrap{overflow:auto;border:1px solid #2b4756;border-radius:12px}table{border-collapse:collapse;width:100%;min-width:800px}th,td{text-align:left;padding:.75rem;border-bottom:1px solid #2b4756}thead th{background:#1e3446}</style></head><body><h1>Food Identity Review</h1><p><a href="/">Data Quality Radar</a> · <a href="/queue">Reference Work Queue</a> · <a href="/identity-review.json">Machine-readable list</a></p><div class="notice"><strong>${review.items.length.toLocaleString('en-US')} ambiguous source records</strong><p>These records remain outside the candidate catalog until an agent records an exact identity decision. Catalog publication continues and the active catalog remains available.</p></div><p>Release ${escapeHtml(review.releaseId)} · Generated ${escapeHtml(review.generatedAt)} · Publication blocking: ${review.blocksPublication ? 'Yes' : 'No'}</p><div class="table-wrap"><table><thead><tr><th>Source food</th><th>Provider</th><th>Source record</th><th>Reason</th><th>Candidate identities</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No ambiguous identities are waiting.</td></tr>'}</tbody></table></div></body></html>`;
}
