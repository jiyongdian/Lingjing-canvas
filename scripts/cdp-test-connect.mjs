// 自动化连线测试：通过 CDP 模拟从一个 source handle 拖拽到一个 target handle，
// 检测 React Flow 边数是否增加（连线成功）。
// 用 Input.dispatchMouseEvent 派发受信任的鼠标事件，React Flow 的 pointer 监听能收到。
// 退出码 0 = 连线成功(边数+1)，1 = 失败(边数没变)。
const PORT = process.env.CDP_PORT || 9222;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = list.find((p) => p.type === "page" && p.webSocketDebuggerUrl);
if (!page) { console.error("no page"); process.exit(2); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable");

const evalJS = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: `(function(){try{return JSON.stringify(${expr})}catch(e){return 'ERR:'+e.message}})()`, returnByValue: true, awaitPromise: true });
  try { return JSON.parse(r.result?.result?.value); } catch { return r.result?.result?.value; }
};

// 1) 找一对未相连的 source/target handle（不同节点）
const handles = await evalJS(`
Array.from(document.querySelectorAll('.react-flow__handle')).map(h=>{
  const r=h.getBoundingClientRect(); const n=h.closest('.react-flow__node');
  return {type:h.classList.contains('source')?'source':(h.classList.contains('target')?'target':'?'), nodeId:n&&n.getAttribute('data-id'), x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};
}).filter(h=>h.x>0)
`);
const sources = handles.filter((h) => h.type === "source");
const targets = handles.filter((h) => h.type === "target");
// 选一对不同节点的
let src = null, tgt = null;
outer: for (const s of sources) for (const t of targets) if (s.nodeId !== t.nodeId) { src = s; tgt = t; break outer; }
if (!src || !tgt) { console.log("RESULT: 找不到可连的handle对"); ws.close(); process.exit(2); }

const beforeEdges = await evalJS(`document.querySelectorAll('.react-flow__edge').length`);
console.log(`连线: ${src.nodeId}(${src.x},${src.y}) -> ${tgt.nodeId}(${tgt.x},${tgt.y}), 连线前边数=${beforeEdges}`);

// 2) 模拟拖拽: mousePressed 在 source → 多次 mouseMoved → mouseReleased 在 target
const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, ...extra });
await mouse("mousePressed", src.x, src.y);
const steps = 8;
for (let i = 1; i <= steps; i++) {
  const x = src.x + ((tgt.x - src.x) * i) / steps;
  const y = src.y + ((tgt.y - src.y) * i) / steps;
  await mouse("mouseMoved", Math.round(x), Math.round(y));
  await new Promise((r) => setTimeout(r, 30));
}
await mouse("mouseMoved", tgt.x, tgt.y);
await new Promise((r) => setTimeout(r, 60));
await mouse("mouseReleased", tgt.x, tgt.y);
await new Promise((r) => setTimeout(r, 300));

const afterEdges = await evalJS(`document.querySelectorAll('.react-flow__edge').length`);
console.log(`连线后边数=${afterEdges}`);
const ok = afterEdges > beforeEdges;
console.log(ok ? "RESULT: ✓ 连线成功" : "RESULT: ✗ 连线失败(边数未增加)");
ws.close();
process.exit(ok ? 0 : 1);
