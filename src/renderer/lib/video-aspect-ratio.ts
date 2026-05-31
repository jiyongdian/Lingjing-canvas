// 视频尺寸与画幅比例归一化工具。
// 从前端 bundle (index-Bsv1kDi5.js 行 3518-3536) 反混淆而来，行为保持不变。

/**
 * 把任意尺寸字符串归一化为 "宽x高" 形式（如 "1280x720"）。
 * 解析失败时回退到 "1280x720"。
 */
export function normalizeVideoSizeValue(input: any): string {
  const match = String(input || "").trim().match(/(\d{2,5})\s*[xX]\s*(\d{2,5})/);
  return match ? `${match[1]}x${match[2]}` : "1280x720";
}

/**
 * 把任意画幅描述归一化为最简比例字符串（如 "16:9"）。
 * - 若输入本身是 "a:b" 形式，直接规整返回；
 * - 否则尝试从 fallback 尺寸（默认 "1280x720"）推导；
 * - 都失败则返回 "16:9"。
 */
export function normalizeVideoAspectRatioValue(input: any, fallbackSize = "1280x720"): string {
  const rawRatio = String(input || "").trim();
  let parsed = rawRatio.match(/^(\d+(?:\.\d+)?)\s*[:xX\/]\s*(\d+(?:\.\d+)?)$/);
  if (parsed && rawRatio.includes(":")) return `${parsed[1]}:${parsed[2]}`;
  if (!parsed) parsed = String(fallbackSize || "").trim().match(/^(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)$/);
  if (!parsed) return "16:9";
  const width = Number(parsed[1]);
  const height = Number(parsed[2]);
  if (!isFinite(width) || !isFinite(height) || width <= 0 || height <= 0) return "16:9";
  // 欧几里得求最大公约数，约分为最简比例。
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(Math.round(width * 100), Math.round(height * 100));
  return `${Math.round(width * 100) / divisor}:${Math.round(height * 100) / divisor}`;
}
