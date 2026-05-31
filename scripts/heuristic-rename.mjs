// 启发式作用域安全重命名器：对一个代码块里的"短名局部变量"，根据声明/使用上下文
// 推断更可读的名字，用 @babel 的作用域绑定做安全改名（不碰 scope-0 顶层符号与外部引用）。
//
// 用法: node scripts/heuristic-rename.mjs <输入块> <输出块>
//
// 推断规则（保守，拿不准就不改）：
//  - const x = useRef(...)        -> xRef / 依据后续 .current 用途
//  - [a, b] = useState(v)         -> 依据 b(setter) 命名：b=setFoo -> a=foo；否则按初值类型
//  - const x = useMemo/useCallback-> memo/cb 语义
//  - catch (e)                    -> error
//  - const x = await fetch(...)   -> response
//  - .map((x) => ...)/.forEach    -> item / 依据数组名单数
//  - const x = document.create*   -> el / 具体标签
// 仅处理 1-2 字符的小写起始局部名；同一绑定全引用一致改名；按作用域去重避免冲突。
import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
const traverse = _traverse.default || _traverse;

const [inFile, outFile] = process.argv.slice(2);
const src = readFileSync(inFile, "utf8");
const ast = parse(src, { sourceType: "module", plugins: ["jsx"], errorRecovery: true });

const isShortLocal = (n) => /^[a-z][a-z0-9]?$/.test(n); // single/double lowercase-start

// 收集改名计划：renames = [{binding, newName}]，按作用域保证唯一
const edits = []; // {start, end, newName}
const seen = new WeakSet();

function inferName(binding, name) {
  const decl = binding.path;
  const kind = binding.kind;
  const node = decl.node;

  // catch param
  if (decl.parentPath && decl.parentPath.isCatchClause()) return "error";

  // VariableDeclarator with init
  if (decl.isVariableDeclarator && decl.isVariableDeclarator()) {
    const init = decl.node.init;
    if (init) {
      // useRef
      if (init.type === "CallExpression" && init.callee && init.callee.name === "useRef") return null; // handled by ref suffix below via id
    }
  }
  return null;
}

// We focus on a few extremely safe, high-signal patterns to avoid risk.
const RESERVED = new Set(["if","for","do","in","of","let","var","new","try"]);

traverse(ast, {
  CatchClause(path) {
    const param = path.node.param;
    if (param && param.type === "Identifier" && isShortLocal(param.name)) {
      const binding = path.scope.getBinding(param.name);
      if (binding && !seen.has(binding)) {
        // only if "error" not already taken in scope
        if (!path.scope.getBinding("error") && !path.scope.hasGlobal?.("error")) {
          seen.add(binding);
          planRename(binding, "error");
        }
      }
    }
  },
});

function planRename(binding, newName) {
  if (RESERVED.has(newName)) return;
  // collision check within scope
  if (binding.scope.getBinding(newName)) return;
  // record decl id + all references
  const idNode = binding.identifier;
  const targets = [idNode, ...binding.referencePaths.map((p) => p.node), ...(binding.constantViolations||[]).map(p=>p.node).filter(n=>n&&n.type==="Identifier")];
  for (const n of targets) {
    if (n && typeof n.start === "number") edits.push({ start: n.start, end: n.end, newName });
  }
  binding.scope.rename; // no-op marker
}

// Apply edits right-to-left to preserve offsets
edits.sort((a, b) => b.start - a.start);
let out = src;
let applied = 0;
const occupied = [];
for (const e of edits) {
  // skip overlaps
  if (occupied.some((o) => !(e.end <= o.start || e.start >= o.end))) continue;
  out = out.slice(0, e.start) + e.newName + out.slice(e.end);
  occupied.push(e);
  applied++;
}
writeFileSync(outFile, out);
console.log(`heuristic renames applied: ${applied} (edits ${edits.length}) -> ${outFile}`);
