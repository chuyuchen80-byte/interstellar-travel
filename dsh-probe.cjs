const fs = require("fs");
const { zstdDecompressSync } = require("node:zlib");
const mod = require("C:\\Users\\m1993\\.dsh\\profiles\\node_modules\\@deepseek-ai\\dsh-session-persistence-jsonl\\lib\\index.js");
console.log("exports:", Object.keys(mod).filter(k => /frame|zstd/i.test(k)));
