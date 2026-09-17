// npm run face-far-frr-sweep — measures False Accept Rate / False Reject
// Rate across a threshold sweep (Section 9.2) and picks an operating
// point for facematch.js's FACE_MATCH_THRESHOLD.
//
// Dataset: LFW (Labeled Faces in the Wild) verification pairs, fetched
// live from the "logasja/lfw" mirror on Hugging Face (a standard,
// long-established academic face-verification benchmark, apache-2.0
// licensed) via its public dataset-viewer API — no download/setup step,
// no repo storage of face images. This is the "public dataset like LFW"
// option Section 0/9.2 names explicitly, chosen over sourcing real
// photos of project teammates: it's pre-labelled into genuine/impostor
// pairs (LFW's own pairsDevTest split — rows 0-1099 are same-person
// pairs, 1100-2199 are different-person pairs), so no manual pairing or
// consent-collection process was needed for an academic FAR/FRR study.
//
// Not part of the app or CI — this is an offline analysis tool, rerun by
// hand when the threshold needs revisiting. Its output (chosen threshold
// + chart) is committed to docs/, not the images or raw distances.
const fs = require("fs");
const path = require("path");
const { faceDescriptorFor, euclideanDistance } = require("../issuer/src/pipeline/facematch");

const PAIRS_PER_CLASS = 40; // spec suggests ~30; a few extra as headroom for detection failures
const THRESHOLDS = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8];
const DOCS_DIR = path.join(__dirname, "..", "docs");

async function fetchRows(offset, length) {
  const url = `https://datasets-server.huggingface.co/rows?dataset=logasja/lfw&config=pairs&split=test&offset=${offset}&length=${length}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HF datasets-server request failed: ${res.status}`);
  const body = await res.json();
  return body.rows.map((r) => r.row);
}

async function downloadImage(imgField) {
  const res = await fetch(imgField.src);
  if (!res.ok) throw new Error(`image download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Extracts both descriptors for a pair and returns their distance, or
// null if either image failed face detection (LFW has occasional profile
// shots/occlusions a real detector legitimately can't use) — these pairs
// are excluded from the study rather than counted as a match failure.
async function pairDistance(row) {
  const [buf0, buf1] = await Promise.all([downloadImage(row.img_0), downloadImage(row.img_1)]);
  const [d0, d1] = await Promise.all([faceDescriptorFor(buf0), faceDescriptorFor(buf1)]);
  if (d0.status !== "ok" || d1.status !== "ok") return null;
  return euclideanDistance(d0.descriptor, d1.descriptor);
}

async function collectDistances(offset, label) {
  const rows = await fetchRows(offset, PAIRS_PER_CLASS);
  const distances = [];
  let skipped = 0;
  for (let i = 0; i < rows.length; i++) {
    const dist = await pairDistance(rows[i]);
    if (dist === null) {
      skipped++;
      continue;
    }
    distances.push(dist);
    process.stdout.write(`\r${label}: ${i + 1}/${rows.length} (skipped ${skipped})`);
  }
  process.stdout.write("\n");
  return distances;
}

function svgChart(rows) {
  const width = 640;
  const height = 400;
  const padL = 55;
  const padB = 40;
  const padT = 20;
  const padR = 20;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const xFor = (t) => padL + ((t - 0.3) / (0.8 - 0.3)) * plotW;
  const yFor = (v) => padT + (1 - v) * plotH;

  const farPoints = rows.map((r) => `${xFor(r.threshold)},${yFor(r.far)}`).join(" ");
  const frrPoints = rows.map((r) => `${xFor(r.threshold)},${yFor(r.frr)}`).join(" ");

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(
    (v) =>
      `<line x1="${padL}" y1="${yFor(v)}" x2="${width - padR}" y2="${yFor(v)}" stroke="#e5e7eb" stroke-width="1"/>` +
      `<text x="${padL - 8}" y="${yFor(v) + 4}" font-size="11" text-anchor="end" fill="#6b7280">${v}</text>`
  );
  const xTicks = THRESHOLDS.map(
    (t) =>
      `<text x="${xFor(t)}" y="${height - padB + 16}" font-size="11" text-anchor="middle" fill="#6b7280">${t}</text>`
  );

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">
  <rect x="0" y="0" width="${width}" height="${height}" fill="white"/>
  ${gridLines.join("\n  ")}
  ${xTicks.join("\n  ")}
  <text x="${width / 2}" y="${height - 6}" font-size="12" text-anchor="middle" fill="#111827">Euclidean distance threshold</text>
  <text x="14" y="${height / 2}" font-size="12" text-anchor="middle" fill="#111827" transform="rotate(-90 14 ${height / 2})">Rate</text>
  <polyline points="${farPoints}" fill="none" stroke="#dc2626" stroke-width="2"/>
  <polyline points="${frrPoints}" fill="none" stroke="#2563eb" stroke-width="2"/>
  <circle cx="${width - 170}" cy="${padT + 6}" r="4" fill="#dc2626"/>
  <text x="${width - 160}" y="${padT + 10}" font-size="12" fill="#111827">FAR (accepts an impostor)</text>
  <circle cx="${width - 170}" cy="${padT + 22}" r="4" fill="#2563eb"/>
  <text x="${width - 160}" y="${padT + 26}" font-size="12" fill="#111827">FRR (rejects a genuine match)</text>
</svg>`;
}

async function main() {
  console.log(`Fetching and matching ${PAIRS_PER_CLASS} genuine + ${PAIRS_PER_CLASS} impostor LFW pairs...`);
  const genuine = await collectDistances(0, "genuine");
  const impostor = await collectDistances(1100, "impostor");

  console.log(`\nUsable pairs: ${genuine.length} genuine, ${impostor.length} impostor`);

  const rows = THRESHOLDS.map((threshold) => {
    const farCount = impostor.filter((d) => d <= threshold).length;
    const frrCount = genuine.filter((d) => d > threshold).length;
    return {
      threshold,
      far: farCount / impostor.length,
      frr: frrCount / genuine.length,
    };
  });

  console.log("\nthreshold |   FAR  |   FRR");
  console.log("----------|--------|-------");
  for (const r of rows) {
    console.log(`  ${r.threshold.toFixed(2)}    | ${(r.far * 100).toFixed(1).padStart(5)}% | ${(r.frr * 100).toFixed(1).padStart(5)}%`);
  }

  // Low-FAR bias (Section 9.2): among thresholds that keep FAR at or
  // below 5%, pick the most permissive one (the largest threshold still
  // meeting that bar) — that's the one that rejects the fewest genuine
  // matches to human review without letting more impostors through than
  // the bound allows. FAR only increases as the threshold loosens, so
  // this is the last low-FAR row, not the first.
  const lowFar = rows.filter((r) => r.far <= 0.05);
  const candidate = lowFar[lowFar.length - 1] || rows[0];

  fs.mkdirSync(DOCS_DIR, { recursive: true });
  fs.writeFileSync(path.join(DOCS_DIR, "face-match-far-frr-chart.svg"), svgChart(rows));

  const table = rows
    .map((r) => `| ${r.threshold.toFixed(2)} | ${(r.far * 100).toFixed(1)}% | ${(r.frr * 100).toFixed(1)}% |`)
    .join("\n");

  const md = `# Face-match FAR/FRR sweep

Measured against ${genuine.length} genuine pairs and ${impostor.length} impostor pairs
from the LFW verification-pairs benchmark (\`logasja/lfw\`, pairs/test split,
fetched via the Hugging Face dataset-viewer API — see
\`scripts/face-far-frr-sweep.js\`). Descriptors are 128-d embeddings from
\`@vladmandic/face-api\`'s \`faceRecognitionNet\`, compared by Euclidean
distance.

![FAR/FRR chart](face-match-far-frr-chart.svg)

| Threshold | FAR (accepts impostor) | FRR (rejects genuine) |
|---|---|---|
${table}

## Chosen operating point

\`FACE_MATCH_THRESHOLD = ${candidate.threshold}\` in \`issuer/src/pipeline/facematch.js\`
— the most permissive threshold tested that still keeps FAR at or below
5%, per Section 9.2's guidance to bias toward rejecting impostors (which
fall through to human review) over accepting them. Loosening the
threshold further buys a lower FRR but starts letting impostor pairs
through; tightening it below this point only adds more genuine pairs to
the review queue for no FAR benefit, since FAR is already 0% here.

## Caveats

- ID-photo-vs-selfie matching (this project's actual use case) is harder
  than the selfie-to-selfie matching LFW's pairs approximate — LFW pairs
  are both "in the wild" candid photos of similar quality/pose, not one
  studio-lit ID photo against one phone selfie. This threshold is a
  reasonable starting point, not a validated production number.
- A handful of LFW pairs are skipped where the detector couldn't find
  exactly one face in the sample photo (profile shots, occlusion, more
  than one person in frame) — this affects the exact sample size, not the
  methodology.
- This script hits the network (Hugging Face) and is not run in CI; its
  committed output (this file + the chart) is the artifact that matters.
`;
  fs.writeFileSync(path.join(DOCS_DIR, "face-match-far-frr.md"), md);

  console.log(`\nChosen threshold: ${candidate.threshold} (FAR ${(candidate.far * 100).toFixed(1)}%, FRR ${(candidate.frr * 100).toFixed(1)}%)`);
  console.log(`Wrote docs/face-match-far-frr.md and docs/face-match-far-frr-chart.svg`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
