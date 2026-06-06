// 哈希与编码工具：基于 node crypto 提供 sha256/hmac 与缓冲区可移植值转换
const crypto = require("crypto");
const fs = require("fs");

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!bytes) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function portableValueFromBuffer(buffer, mime) {
  const normalized = String(mime || "").split(";")[0].trim().toLowerCase();
  if (
    normalized.startsWith("text/") ||
    normalized === "application/json" ||
    normalized === "application/ld+json"
  ) {
    return {
      value: buffer.toString("utf8"),
      valueFormat: normalized === "application/json" ? "json" : "text"
    };
  }
  return {
    value: `data:${mime || "application/octet-stream"};base64,${buffer.toString("base64")}`,
    valueFormat: "data-url"
  };
}

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest(encoding);
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

module.exports = {
  sha256Buffer,
  sha256File,
  sha256Hex,
  hmac,
  portableValueFromBuffer
};
