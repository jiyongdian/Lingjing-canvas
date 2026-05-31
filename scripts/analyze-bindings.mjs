// 分析一个 JS 代码块里的"短名局部变量"绑定，输出每个绑定的作用域路径、声明类型、
// 以及若干使用上下文样本，供 AI 提出语义化新名。
// 用法: node scripts/analyze-bindings.mjs <输入块文件> <输出json>
import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
const traverse = _traverse.default || _traverse;

const [inFile, outFile] = process.argv.slice(2);
const src = readFileSync(inFile, "utf8");

// 把块包成可解析的表达式语句（处理 var X = ... / function X(){} 两种形态）
let wrapped = src;
const ast = parse(wrapped, { sourceType: "module", plugins: ["jsx"], errorRecovery: true });

// 只重命名"短名"(1-2 字符，纯小写字母/含数字)的局部绑定；跳过已可读的名字
const isShort = (n) => /^[a-z][a-z0-9]?$/i.test(n) && n.length <= 2;

const bindings = [];
let scopeId = 0;
const scopeIds = new WeakMap();
function sid(scope) {
  if (!scopeIds.has(scope)) scopeIds.set(scope, scopeId++);
  return scopeIds.get(scope);
}

const seenScopes = new WeakSet();
function harvestScope(scope) {
  if (!scope || seenScopes.has(scope)) return;
  seenScopes.add(scope);
  for (const [name, binding] of Object.entries(scope.bindings)) {
    if (!isShort(name)) continue;
    const refs = binding.referencePaths || [];
    const samples = [];
    for (const ref of refs.slice(0, 4)) {
      let p = ref;
      let depth = 0;
      while (p.parentPath && depth < 3 && p.node.end - p.node.start < 60) { p = p.parentPath; depth++; }
      const s = wrapped.slice(p.node.start, Math.min(p.node.end, p.node.start + 70)).replace(/\s+/g, " ");
      samples.push(s);
    }
    bindings.push({
      name,
      bindingId: binding.identifier.start,
      scope: sid(scope),
      kind: binding.kind,
      refCount: refs.length,
      declSnippet: wrapped.slice(binding.path.node.start, Math.min(binding.path.node.end, binding.path.node.start + 80)).replace(/\s+/g, " "),
      samples,
    });
  }
}

traverse(ast, {
  enter(path) {
    if (path.scope) harvestScope(path.scope);
  },
});

writeFileSync(outFile, JSON.stringify({ total: bindings.length, bindings }, null, 1));
console.log(`bindings(short locals): ${bindings.length} -> ${outFile}`);
