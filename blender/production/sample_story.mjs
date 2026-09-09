/** Run with Node 22.23.2 --experimental-strip-types; samples the runtime score. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';

const sourcePath = 'src/features/landing/scrollStoryModel.ts';
const sourceUrl = new URL(`../../${sourcePath}`, import.meta.url);
const sourceBytes = await readFile(sourceUrl);
const { storyPresentation, STORY_DURATION_MS } = await import(sourceUrl.href);
const fps = 24;
const intervals = STORY_DURATION_MS / 1000 * fps;
if (STORY_DURATION_MS !== 72_000 || !Number.isInteger(intervals))
  throw new Error('Expected the 72-second runtime story at 24 fps.');

function sample(progress, frame) {
  const { position, target, fov, cutaway } = storyPresentation(progress, false, false);
  return { frame, progress, position, target, fov, cutaway };
}

const result = {
  source: {
    path: sourcePath,
    sha256: createHash('sha256').update(sourceBytes).digest('hex'),
  },
  durationMs: STORY_DURATION_MS,
  fps,
  frameStart: 1,
  inclusiveEndpoint: true,
  frames: Array.from({ length: intervals + 1 }, (_, index) => sample(index / intervals, index + 1)),
  // Preserve exact proof poses; progress .9 lies between two integer frames.
  proofs: [0, .5, .9].map((progress) => sample(progress, 1 + progress * intervals)),
};
if (!sourceBytes.equals(await readFile(sourceUrl)))
  throw new Error('The runtime score changed during sampling; rerun this exporter.');
const output = new URL('./v3/story/camera-samples.json', import.meta.url);
result.desktopPoseSha256 = createHash('sha256').update(JSON.stringify(result.frames)).digest('hex');
if (process.argv.includes('--validate')) {
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const local = name => new URL(`./v3/story/${name}`, import.meta.url);
  const readJson = async name => JSON.parse(await readFile(local(name), 'utf8'));
  const saved = await readJson('camera-samples.json');
  const story = await readJson('render-manifest.json');
  const materials = await readJson('material-closeup-manifest.json');
  // The saved hash identifies the code used to author the Blender source.
  // Runtime timing fixes may change that file without changing any camera pose.
  assert.equal(saved.source.path, result.source.path);
  assert.deepEqual(saved.frames, result.frames);
  assert.deepEqual(saved.proofs, result.proofs);
  assert.equal(story.savedFileValidation.currentCameraCodeSha256, saved.source.sha256);
  assert.equal(story.desktopPoseSha256, result.desktopPoseSha256);
  assert.equal(story.status, 'complete');
  assert.equal(materials.status, 'complete');
  for (const [path, expected] of [
    [new URL(`../../${story.sourceBlend}`, import.meta.url), story.sourceBlendSha256],
    [new URL(`../../${materials.source}`, import.meta.url), materials.sourceSha256],
    [local(story.editableBlend.path), story.editableBlend.sha256],
    [local(materials.blend), materials.blendSha256],
    ...story.proofs.map(proof => [local(proof.path), proof.sha256]),
    ...materials.proofs.map(proof => [local(proof.image), proof.imageSha256]),
  ]) assert.equal(sha(await readFile(path)), expected, `Changed artifact: ${path}`);
  const surfaceSource = await readFile(new URL('../../src/features/gallery/GalleryScene.tsx', import.meta.url), 'utf8');
  const start = surfaceSource.indexOf('function createSurfaceDetailMaps(');
  assert.ok(start >= 0);
  const detailCode = surfaceSource.slice(start, surfaceSource.indexOf('\n}', start) + 2).replace('kind: SurfaceKind', 'kind');
  // Exercise the actual deterministic runtime function with only Canvas buffers mocked.
  const generate = runInNewContext(`(${detailCode})`, {
    Math, Uint8ClampedArray,
    document: { createElement() {
      const canvas = {};
      canvas.getContext = () => ({
        createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4) }; },
        putImageData(image) { canvas.rgba = image.data; },
      });
      return canvas;
    } },
    THREE: { CanvasTexture: class { constructor(canvas) { this.canvas = canvas; } }, NoColorSpace: '', RepeatWrapping: 1000 },
  });
  for (const proof of materials.proofs) {
    const actual = generate(proof.kind);
    assert.equal(sha(actual.bumpMap.canvas.rgba), proof.heightRgbaSha256, `${proof.kind} height`);
    assert.equal(sha(actual.roughnessMap.canvas.rgba), proof.roughnessRgbaSha256, `${proof.kind} roughness`);
  }
  assert.equal(sha(await readFile(sourceUrl)), result.source.sha256, 'Camera source changed during validation.');
  const validation = { status: 'passed', node: process.version, currentCameraCode: result.source,
    renderCameraCode: saved.source, cameraSamplesUnchanged: true,
    desktopPoseSha256: result.desktopPoseSha256, desktopFrames: result.frames.length,
    artifactAndOriginalHashesMatch: true, runtimeDetailSourceSha256: sha(surfaceSource),
    runtimeDetailFunctionSha256: sha(detailCode),
    materialDetailByteExactMatches: materials.proofs.map(proof => proof.kind),
    savedMaterialNodesValidated: materials.savedFileValidation.length,
  };
  await writeFile(local('final-validation.json'), `${JSON.stringify(validation, null, 2)}\n`);
  console.log(JSON.stringify(validation));
  process.exit(0);
}
try {
  const previous = JSON.parse(await readFile(output, 'utf8'));
  result.previousSampleValidation = {
    source: previous.source,
    desktopSamplesIdentical: JSON.stringify(previous.frames) === JSON.stringify(result.frames),
    proofSamplesIdentical: JSON.stringify(previous.proofs) === JSON.stringify(result.proofs),
  };
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await mkdir(new URL('.', output), { recursive: true });
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output: 'blender/production/v3/story/camera-samples.json', frames: result.frames.length, ...result.source }));
