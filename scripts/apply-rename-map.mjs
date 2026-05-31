// 作用域安全的批量改名器（保留原始格式：只替换标识符 token 区间，不重新生成代码）。
//
// 映射格式：[{ "bindingId": <声明标识符的源码偏移>, "from": "e", "to": "resource" }, ...]
// bindingId 与 analyze-bindings.mjs 输出的 bindingId 一致（同一份源码、同一 parser），
// 是绝对稳定的主键，不依赖遍历顺序。
//
// 安全性：用 binding.identifier + referencePaths + constantViolations 取该绑定在其作用域内
// 的全部出现位置，只改这些精确区间；遮蔽/别作用域同名天然不受影响。
//
// 用法: node scripts/apply-rename-map.mjs <输入块> <映射json> <输出块>
import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
const traverse = _traverse.default || _traverse;

const [inFile, mapFile, outFile] = process.argv.slice(2);
const src = readFileSync(inFile, "utf8");
const renameMap = JSON.parse(readFileSync(mapFile, "utf8"));
const ast = parse(src, { sourceType: "module", plugins: ["jsx"], errorRecovery: true });

// 索引：声明标识符 start 偏移 -> binding
const byId = new Map();
const seenScopes = new WeakSet();
traverse(ast, {
  enter(path) {
    const scope = path.scope;
    if (!scope || seenScopes.has(scope)) return;
    seenScopes.add(scope);
    for (const binding of Object.values(scope.bindings)) {
      if (binding.identifier && typeof binding.identifier.start === "number") {
        byId.set(binding.identifier.start, binding);
      }
    }
  },
});

const edits = [];
const errors = [];
let planned = 0;

// 冲突检测：①同作用域多个绑定改同名 → 数字后缀；②避开本作用域可见的外层绑定名(遮蔽)；
// ③避开"本运行中祖先作用域已认领的新名"——否则后代改成同名会遮蔽祖先(本 bug 根因)。
const scopeTargets = new Map();   // scopeKey -> Set(本作用域已认领/已有的名字)
const scopeClaimed = new Map();   // scopeKey -> Set(本运行中在该作用域认领的新名)
function scopeKey(scope) {
  if (!scope.__wjid) scope.__wjid = (scopeKey._n = (scopeKey._n || 0) + 1);
  return scope.__wjid;
}
function ancestorClaimed(scope, name) {
  // 沿父链(不含自身)查是否有祖先作用域已把某绑定改名为 name
  let s = scope.parent;
  while (s) {
    const set = scopeClaimed.get(scopeKey(s));
    if (set && set.has(name)) return true;
    s = s.parent;
  }
  return false;
}
function reserveName(scope, desired) {
  const key = scopeKey(scope);
  let used = scopeTargets.get(key);
  if (!used) {
    used = new Set();
    for (const n of Object.keys(scope.bindings)) used.add(n);
    scopeTargets.set(key, used);
  }
  const isUnsafe = (name) => {
    if (used.has(name)) return true;
    if (scope.getBinding(name)) return true;                 // 可见外层绑定 → 遮蔽
    if (ancestorClaimed(scope, name)) return true;           // 祖先本轮认领的新名 → 遮蔽
    if (typeof scope.hasGlobal === "function" && scope.hasGlobal(name)) return true;
    return false;
  };
  let name = desired;
  let i = 2;
  while (isUnsafe(name)) name = `${desired}${i++}`;
  used.add(name);
  let claimed = scopeClaimed.get(key);
  if (!claimed) { claimed = new Set(); scopeClaimed.set(key, claimed); }
  claimed.add(name);
  return name;
}

for (const { bindingId, from, to } of renameMap) {
  const binding = byId.get(bindingId);
  if (!binding) { errors.push(`bindingId ${bindingId} (${from}->${to}) not found`); continue; }
  if (from && binding.identifier.name !== from) { errors.push(`bindingId ${bindingId}: expected '${from}' got '${binding.identifier.name}'`); continue; }
  const actualFrom = binding.identifier.name;
  const finalName = reserveName(binding.scope, to);

  // 收集要改的标识符 NodePath：声明处 + 所有引用 + 赋值违例。用 path 以便判断是否在简写属性里。
  const idPaths = [];
  if (binding.path) {
    // 声明标识符本体
    if (binding.identifier && binding.identifier.name === actualFrom) idPaths.push({ node: binding.identifier, parent: binding.path.node });
  }
  for (const rp of binding.referencePaths) idPaths.push({ node: rp.node, parent: rp.parent });
  for (const cv of (binding.constantViolations || [])) {
    let node = cv.node;
    if (node && node.type === "AssignmentExpression") node = node.left;
    if (node && node.type === "Identifier") idPaths.push({ node, parent: cv.parent });
  }

  for (const { node, parent } of idPaths) {
    if (!node || node.type !== "Identifier" || typeof node.start !== "number" || node.name !== actualFrom) continue;
    // 简写对象属性 { d } —— babel 里 key 与 value 是两个独立 Identifier 实例，但都叫同名。
    // 必须展开成 { d: finalName }（保留 key 文本），否则会改坏 SVG/DOM 属性名或解构语义。
    if (parent && parent.type === "ObjectProperty" && parent.shorthand && parent.value === node) {
      // 在 value 标识符后插入 ": finalName"；key 文本(同位置)保持不动。
      edits.push({ start: node.end, end: node.end, to: `: ${finalName}`, insert: true });
    } else {
      edits.push({ start: node.start, end: node.end, to: finalName });
    }
  }
  planned++;
}

edits.sort((a, b) => b.start - a.start);
let out = src, applied = 0, lastStart = Infinity;
for (const e of edits) {
  // 插入型(简写展开)在 start===end 处插入，不与替换冲突；替换型用 end<=lastStart 防重叠。
  if (e.insert) {
    if (e.start > lastStart) continue;
    out = out.slice(0, e.start) + e.to + out.slice(e.start);
    lastStart = Math.min(lastStart, e.start);
    applied++;
  } else {
    if (e.end > lastStart) continue;
    out = out.slice(0, e.start) + e.to + out.slice(e.end);
    lastStart = e.start;
    applied++;
  }
}
writeFileSync(outFile, out);
console.log(`planned ${planned}/${renameMap.length} bindings, applied ${applied} token edits -> ${outFile}`);
if (errors.length) console.log(`errors(${errors.length}):\n  ` + errors.slice(0, 15).join("\n  "));
