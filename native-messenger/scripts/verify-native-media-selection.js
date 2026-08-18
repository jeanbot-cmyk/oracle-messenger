#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

async function main() {
  const root = path.resolve(__dirname, '..');
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-native-media-'));
  execFileSync(path.join(root, 'node_modules/.bin/tsc'), [
    'src/screens/home/nativeMessageMediaPipeline.ts',
    '--target', 'ES2020',
    '--module', 'commonjs',
    '--strict',
    '--esModuleInterop',
    '--skipLibCheck',
    '--outDir', outDir,
  ], { cwd: root, stdio: 'inherit' });

  const pipeline = require(path.join(outDir, 'nativeMessageMediaPipeline.js'));
  verifySelectionKeepsTwentyAssets(pipeline);
  verifyCameraPhotoAsset(pipeline);
  verifySelectionRejectsOverflowExplicitly(pipeline);
  verifyInvalidAssetsDoNotCancelSelection(pipeline);
  verifyDocumentsKeepTwentyAssets(pipeline);
  verifyDocumentOverflowAndInvalidUri(pipeline);
  await verifyQueueConcurrencyAndOrder(pipeline);
  console.log('Native media selection pipeline: PASS');
}

function verifySelectionKeepsTwentyAssets(pipeline) {
  const assets = Array.from({ length: 20 }, (_, index) => ({
    uri: `file:///photos/photo-${index + 1}.jpg`,
    type: 'image',
    mimeType: 'image/jpeg',
    fileName: `photo-${index + 1}.jpg`,
    fileSize: 120_000 + index,
    width: 1600,
    height: 1200,
  }));

  const result = pipeline.normalizePickedNativeMediaAssets(assets, { maxSelection: 20 });
  assert.strictEqual(result.accepted.length, 20, '20 selected photos must remain accepted');
  assert.strictEqual(result.rejected.length, 0, 'no selected photo should be silently rejected');
  assert.deepStrictEqual(result.accepted.map(item => item.name), assets.map(item => item.fileName), 'selection order must be preserved');
}

function verifyCameraPhotoAsset(pipeline) {
  const result = pipeline.normalizePickedNativeMediaAssets([{
    uri: 'file:///camera/capture-001.jpg',
    type: 'image',
    mimeType: 'image/jpeg',
    fileName: 'camera-capture.jpg',
    fileSize: 2_400_000,
    width: 4032,
    height: 3024,
  }], { maxSelection: 1 });

  assert.strictEqual(result.accepted.length, 1, 'camera photo must be accepted');
  assert.strictEqual(result.rejected.length, 0, 'camera photo must not be rejected');
  assert.strictEqual(result.accepted[0].kind, 'image', 'camera photo must be sent as image');
  assert.strictEqual(result.accepted[0].mime, 'image/jpeg', 'camera photo mime must be preserved');
  assert.strictEqual(result.accepted[0].width, 4032, 'camera width metadata must be preserved');
  assert.strictEqual(result.accepted[0].height, 3024, 'camera height metadata must be preserved');
}

function verifySelectionRejectsOverflowExplicitly(pipeline) {
  const assets = Array.from({ length: 22 }, (_, index) => ({
    uri: `file:///photos/photo-${index + 1}.jpg`,
    type: 'image',
    fileName: `photo-${index + 1}.jpg`,
  }));

  const result = pipeline.normalizePickedNativeMediaAssets(assets, { maxSelection: 20 });
  assert.strictEqual(result.accepted.length, 20, 'only the documented max selection should be accepted');
  assert.strictEqual(result.rejected.length, 2, 'overflow must be reported, not hidden');
  assert.ok(result.rejected.every(item => item.reason.includes('20')), 'overflow reason must mention the current limit');
}

function verifyInvalidAssetsDoNotCancelSelection(pipeline) {
  const result = pipeline.normalizePickedNativeMediaAssets([
    { uri: 'file:///photos/ok-1.png', type: 'image', mimeType: 'image/png', fileName: 'ok-1.png' },
    { uri: '', type: 'image', fileName: 'broken.png' },
    { uri: 'file:///photos/ok-2.webp', type: 'image', mimeType: 'image/webp', fileName: 'ok-2.webp' },
    { uri: 'file:///photos/unknown.xyz', type: 'binary', mimeType: 'application/x-custom', fileName: 'unknown.xyz' },
    { uri: 'file:///photos/nameless', type: null, mimeType: null, fileName: null },
  ], { maxSelection: 20 });

  assert.strictEqual(result.accepted.length, 2, 'valid photos must continue after an invalid asset');
  assert.strictEqual(result.rejected.length, 3, 'invalid assets must be reported individually');
  assert.deepStrictEqual(result.accepted.map(item => item.name), ['ok-1.png', 'ok-2.webp']);
}

function verifyDocumentsKeepTwentyAssets(pipeline) {
  const assets = Array.from({ length: 20 }, (_, index) => ({
    uri: index % 2 === 0 ? `content://downloads/document-${index + 1}` : `file:///documents/document-${index + 1}.pdf`,
    name: index === 4 ? `audio-${index + 1}.m4a` : `document-${index + 1}.pdf`,
    mimeType: index === 4 ? 'audio/mp4' : 'application/pdf',
    size: 90_000 + index,
  }));

  const result = pipeline.normalizePickedNativeDocuments(assets, { maxSelection: 20 });
  assert.strictEqual(result.accepted.length, 20, '20 selected documents must remain accepted');
  assert.strictEqual(result.rejected.length, 0, 'no selected document should be silently rejected');
  assert.deepStrictEqual(result.accepted.map(item => item.name), assets.map(item => item.name), 'document order must be preserved');
  assert.strictEqual(result.accepted[4].kind, 'audio', 'audio document must keep audio kind');
  assert.ok(Array.isArray(result.accepted[4].waveform), 'audio document must get waveform metadata');
  assert.strictEqual(result.accepted[0].uri.startsWith('content://'), true, 'content:// document URI must be kept for upload');
}

function verifyDocumentOverflowAndInvalidUri(pipeline) {
  const assets = Array.from({ length: 22 }, (_, index) => ({
    uri: index === 3 ? '' : `content://documents/file-${index + 1}`,
    name: `file-${index + 1}.bin`,
    mimeType: 'application/octet-stream',
    size: 1000 + index,
  }));

  const result = pipeline.normalizePickedNativeDocuments(assets, { maxSelection: 20 });
  assert.strictEqual(result.accepted.length, 20, 'valid documents must fill the documented selection limit');
  assert.strictEqual(result.rejected.length, 2, 'invalid document and overflow must be reported explicitly');
  assert.ok(result.rejected.some(item => item.reason.includes('URI Android')), 'missing document URI must be reported');
  assert.ok(result.rejected.some(item => item.reason.includes('20')), 'document overflow must mention current limit');
}

async function verifyQueueConcurrencyAndOrder(pipeline) {
  const items = [0, 1, 2, 3, 4, 5];
  let active = 0;
  let maxActive = 0;
  const results = await pipeline.runLimitedNativeMediaQueue(items, 3, async item => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await sleep(item === 1 ? 35 : 5);
    active -= 1;
    if (item === 4) throw new Error('upload failed');
    return item * 10;
  });

  assert.ok(maxActive <= 3, `queue exceeded concurrency limit: ${maxActive}`);
  assert.deepStrictEqual(results.map(result => result.index), items, 'results must stay in input order');
  assert.strictEqual(results.filter(result => result.ok).length, 5, 'one failed item must not cancel the queue');
  assert.strictEqual(results[4].ok, false, 'the failed item must be isolated');
  assert.strictEqual(results[5].value, 50, 'items after a failure must continue');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
