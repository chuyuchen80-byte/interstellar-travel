const fs = require("fs");
const { zstdDecompressSync } = require("node:zlib");

const ZSTD_MAGIC = 4247762216; // 0xFD2FB528

function scanZstdFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    if (buffer.length - offset < 4) break;
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) {
      console.error(`Invalid magic at byte ${offset}`);
      break;
    }
    offset += 4;
    if (offset === buffer.length) break;
    const descriptor = buffer.readUInt8(offset);
    offset += 1;
    if ((descriptor & 24) !== 0) { console.error(`Reserved bit at ${offset-1}`); break; }
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 32) !== 0;
    const checksum = (descriptor & 4) !== 0;
    const dictionaryFlag = descriptor & 3;
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentSizeFlag === 0 ? singleSegment ? 1 : 0 : 1 << contentSizeFlag;
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
    if (buffer.length - offset < remainingHeaderBytes) break;
    offset += remainingHeaderBytes;
    for (;;) {
      if (buffer.length - offset < 3) break;
      const blockHeader = buffer.readUIntLE(offset, 3);
      offset += 3;
      const lastBlock = (blockHeader & 1) !== 0;
      const blockType = blockHeader >>> 1 & 3;
      const blockSize = blockHeader >>> 3;
      if (blockType === 3) { console.error(`Reserved block type at ${offset-3}`); break; }
      const payloadBytes = blockType === 1 ? 1 : blockSize;
      if (buffer.length - offset < payloadBytes) break;
      offset += payloadBytes;
      if (lastBlock) break;
    }
    if (checksum) {
      if (buffer.length - offset < 4) break;
      offset += 4;
    }
    frames.push({ start, end: offset });
  }
  return frames;
}

const base = "C:\\Users\\m1993\\.dsh\\sessions\\--D-User-AppData-Local-Programs-deepseek--";
for (const id of ["session-9b3d57c9-c026-4353-8420-7be84017a1c1", "session-cd76f4a5-4ac1-409c-9292-5b0249296879"]) {
  const src = `${base}\\${id}\\session.jsonl.zstd`;
  const compressed = fs.readFileSync(src);
  const frames = scanZstdFrames(compressed);
  console.log(`${id}: ${compressed.length} bytes compressed, ${frames.length} frames`);
  let allDecoded = Buffer.alloc(0);
  for (const { start, end } of frames) {
    const frameBuf = compressed.subarray(start, end);
    try {
      const decoded = zstdDecompressSync(frameBuf);
      allDecoded = Buffer.concat([allDecoded, decoded]);
    } catch (e) {
      console.error(`  Frame ${start}-${end} failed:`, e.message);
    }
  }
  const dst = `${process.env.TEMP}\\dsh-${id}.jsonl`;
  fs.writeFileSync(dst, allDecoded);
  const lines = allDecoded.toString("utf8").split("\n").filter(Boolean);
  console.log(`  -> ${allDecoded.length} bytes decoded, ${lines.length} records -> ${dst}`);
}