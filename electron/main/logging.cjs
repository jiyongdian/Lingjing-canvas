// 日志与错误格式化模块：诊断日志写入、日志载荷脱敏与截断、错误消息格式化等底层工具
const fs = require("fs");
const path = require("path");
const { app } = require("./electron-refs.cjs");

function isBenignEpipeError(error) {
  if (!error) return false;
  return error.code === "EPIPE" || /write epipe/i.test(String(error.message || error));
}

function extractPublicUrlFromText(value) {
  const text = String(value || "").trim();
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0].replace(/[),.;]+$/g, "") : "";
}

function formatErrorMessage(error) {
  const parts = [String(error?.message || error || "Unknown error")];
  if (error?.cause?.code) parts.push(`cause=${error.cause.code}`);
  if (error?.cause?.message) parts.push(error.cause.message);
  return parts.filter(Boolean).join("; ");
}

function summarizeUploadError(error, limit = 180) {
  return truncateLogValue(
    formatErrorMessage(error)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "unknown upload error",
    limit
  );
}

function truncateLogValue(value, limit = 2000) {
  if (typeof value !== "string") return value;
  return value.length > limit
    ? `${value.slice(0, limit)}... [truncated ${value.length - limit} chars]`
    : value;
}

function sanitizeLogPayload(payload) {
  if (!payload || typeof payload !== "object") return truncateLogValue(payload);
  if (Array.isArray(payload)) return payload.map((item) => sanitizeLogPayload(item));
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      /(api[-_]?key|secret|token|authorization|password|credential|access[-_]?key)/i.test(key)
        ? "[redacted]"
        : sanitizeLogPayload(value)
    ])
  );
}

function appendDesktopLog(type, payload) {
  try {
    const logPath = path.join(app.getPath("userData"), "desktop-diagnostics.log");
    const line = JSON.stringify({
      time: new Date().toISOString(),
      type,
      payload: sanitizeLogPayload(payload)
    });
    fs.appendFile(logPath, `${line}\n`, () => {});
  } catch {
    // Diagnostics must never affect app startup or rendering.
  }
}

module.exports = {
  isBenignEpipeError,
  extractPublicUrlFromText,
  formatErrorMessage,
  summarizeUploadError,
  truncateLogValue,
  sanitizeLogPayload,
  appendDesktopLog
};
