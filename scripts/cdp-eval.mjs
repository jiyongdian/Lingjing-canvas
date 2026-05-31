// CDP 客户端：连上 Electron 渲染进程(--remote-debugging-port=9222)，在页面里执行 JS 并返回结果。
// 用法: node scripts/cdp-eval.mjs '<要执行的JS表达式>'
// 依赖 Node 内置 WebSocket(Node 22+) 与 fetch。
const PORT = process.env.CDP_PORT || 9222;
const expr = process.argv[2];
if (!expr) { console.error("用法: node cdp-eval.mjs '<js>'"); process.exit(1); }

const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = list.find((p) => p.type === "page" && p.webSocketDebuggerUrl);
if (!page) { console.error("找不到渲染进程页面"); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
function send(method, params) {
  return new Promise((resolve) => {
    const msgId = ++id;
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});

await new Promise((r) => ws.addEventListener("open", r));
await send("Runtime.enable");
const res = await send("Runtime.evaluate", {
  expression: `(function(){ try { return JSON.stringify(${expr}); } catch(e){ return 'ERR: '+e.message; } })()`,
  returnByValue: true,
  awaitPromise: true,
});
const val = res.result?.result?.value;
console.log(val !== undefined ? val : JSON.stringify(res.result));
ws.close();
process.exit(0);
