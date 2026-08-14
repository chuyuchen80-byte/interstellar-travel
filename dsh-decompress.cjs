const fs = require("fs");
const { zstdDecompressSync } = require("node:zlib");
const base = "C:\\Users\\m1993\\.dsh\\sessions\\--D-User-AppData-Local-Programs-deepseek--";
for (const id of ["session-9b3d57c9-c026-4353-8420-7be84017a1c1", "session-cd76f4a5-4ac1-409c-9292-5b0249296879"]) {
  const src = `${base}\\${id}\\session.jsonl.zstd`;
  const buf = zstdDecompressSync(fs.readFileSync(src));
  const dst = `${process.env.TEMP}\\dsh-${id}.jsonl`;
  fs.writeFileSync(dst, buf);
  const lines = buf.toString("utf8").split("\n").filter(Boolean);
  console.log(`${id}: ${buf.length} bytes, ${lines.length} records -> ${dst}`);
}
