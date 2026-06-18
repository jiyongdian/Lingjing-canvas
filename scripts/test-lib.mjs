// 工具库行为回归测试：编译 src/renderer/lib 后，对若干纯逻辑函数跑用例，
// 验证反混淆后的实现与预期行为一致。
//
// 运行：npm run test:lib
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(join(tmpdir(), "wj-lib-"));

function compile() {
  execFileSync(
    "npx",
    [
      "tsc",
      "--skipLibCheck",
      "--module", "commonjs",
      "--target", "es2022",
      "--moduleResolution", "node",
      "--jsx", "react-jsx",
      "--outDir", outDir,
      join(root, "src/renderer/lib/resource.ts"),
      join(root, "src/renderer/lib/video-aspect-ratio.ts"),
      join(root, "src/renderer/lib/video-task.ts"),
      join(root, "src/renderer/lib/tianji-api.ts"),
    ],
    { cwd: root, stdio: "inherit" }
  );
}

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
  } else {
    fail++;
    console.error(`  ✗ ${name}: got ${a}, expected ${e}`);
  }
}

async function run() {
  console.log("编译工具库...");
  compile();

  const { wanjuanResourceKind, wanjuanResourceSourceKind } = await import(pathToFileURL(join(outDir, "resource.js")).href);
  const { normalizeVideoAspectRatioValue, normalizeVideoSizeValue } = await import(pathToFileURL(join(outDir, "video-aspect-ratio.js")).href);
  const { WANJUAN_TIANJI_DEFAULT_BASE_URL, wanjuanNormalizeTianjiSeedanceConfig } = await import(pathToFileURL(join(outDir, "tianji-api.js")).href);

  console.log("运行用例...");
  // wanjuanResourceKind
  check("kind text", wanjuanResourceKind({ type: "text" }), "text");
  check("kind audio mime", wanjuanResourceKind({ type: "audio/mp3" }), "audio");
  check("kind audio ext", wanjuanResourceKind({ url: "x.mp3" }), "audio");
  check("kind video", wanjuanResourceKind({ type: "video" }), "video");
  check("kind video ext", wanjuanResourceKind({ url: "clip.MOV" }), "video");
  check("kind image default", wanjuanResourceKind({ url: "a.webp" }), "image");
  check("kind data audio", wanjuanResourceKind({ url: "data:audio/wav;base64,xx" }), "audio");

  // wanjuanResourceSourceKind
  check("source generated", wanjuanResourceSourceKind({ source: "seedance" }), "generated");
  check("source external", wanjuanResourceSourceKind({ source: "upload" }), "external");

  // aspect ratio
  check("ratio colon", normalizeVideoAspectRatioValue("16:9"), "16:9");
  check("ratio from size", normalizeVideoAspectRatioValue("", "1920x1080"), "16:9");
  check("ratio fallback", normalizeVideoAspectRatioValue("garbage"), "16:9");
  check("size normalize", normalizeVideoSizeValue("1280 x 720"), "1280x720");
  check("size fallback", normalizeVideoSizeValue("nope"), "1280x720");

  // Tianji defaults
  check("tianji default base url", WANJUAN_TIANJI_DEFAULT_BASE_URL, "https://newapi.guancn.uk");
  check("tianji missing base url uses default", wanjuanNormalizeTianjiSeedanceConfig({}).baseUrl, "https://newapi.guancn.uk");
  check("tianji trims default trailing slash", wanjuanNormalizeTianjiSeedanceConfig({ baseUrl: " https://newapi.guancn.uk/ " }).baseUrl, "https://newapi.guancn.uk");
  check("tianji saved empty base url stays empty", wanjuanNormalizeTianjiSeedanceConfig({ baseUrl: "" }).baseUrl, "");

  console.log(`\n结果：${pass} 通过，${fail} 失败`);
  rmSync(outDir, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
});
