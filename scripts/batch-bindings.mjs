// 把一个块的 short-local 绑定按"所属顶层成员"分组，便于分发给 AI 命名。
// 顶层成员 = 块内 2 空格缩进的 `Name = ...` 声明（comma-chain 成员）或 function 顶层。
// 用法: node scripts/batch-bindings.mjs <块文件> <bindings.json> <输出目录>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const [blockFile, bindingsFile, outDir] = process.argv.slice(2);
const src = readFileSync(blockFile, "utf8");
const { bindings } = JSON.parse(readFileSync(bindingsFile, "utf8"));
mkdirSync(outDir, { recursive: true });

// member boundaries by char offset: lines matching ^  NAME =  or ^function NAME / ^var NAME
const lines = src.split("\n");
let offset = 0;
const members = []; // {name, start}
for (const line of lines) {
  const m = line.match(/^(?:  )?(?:var |const |let )?([A-Za-z_$][\w$]*)\s*=\s*(?:reactMemo|function|\(|async)/) ||
            line.match(/^(?:async )?function\s+([A-Za-z_$][\w$]*)/);
  if (m) members.push({ name: m[1], start: offset });
  offset += line.length + 1;
}
members.sort((a, b) => a.start - b.start);

function memberOf(pos) {
  let cur = "（顶层）";
  for (const mem of members) { if (mem.start <= pos) cur = mem.name; else break; }
  return cur;
}

const groups = {};
for (const b of bindings) {
  if (b.scope === 0) continue; // skip module-level externals
  const mem = memberOf(b.bindingId);
  (groups[mem] ||= []).push(b);
}

let n = 0;
const index = [];
for (const [mem, list] of Object.entries(groups)) {
  const file = `${outDir}/group-${n}.json`;
  writeFileSync(file, JSON.stringify({ member: mem, bindings: list }, null, 1));
  index.push({ group: n, member: mem, count: list.length });
  n++;
}
writeFileSync(`${outDir}/index.json`, JSON.stringify(index, null, 1));
console.log(`grouped ${bindings.length} bindings into ${n} member-groups -> ${outDir}`);
for (const g of index.sort((a,b)=>b.count-a.count).slice(0,12)) console.log(`  ${g.member}: ${g.count}`);
