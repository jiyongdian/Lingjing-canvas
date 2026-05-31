// 知识库文本提取模块：负责将各类文档文件提取并规范化为纯文本，供知识库导入使用。
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function normalizeKnowledgeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractKnowledgeFileText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if ([".txt", ".md", ".markdown", ".json", ".csv", ".js", ".ts", ".html", ".htm", ".xml"].includes(ext)) {
    return normalizeKnowledgeText(fs.readFileSync(filePath, "utf8"));
  }
  if ([".rtf", ".doc", ".docx", ".odt", ".webarchive"].includes(ext)) {
    try {
      const output = execFileSync("/usr/bin/textutil", ["-convert", "txt", "-stdout", filePath], {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 8
      });
      return normalizeKnowledgeText(output);
    } catch (error) {
      throw new Error(`文档解析失败：${error?.message || error}`);
    }
  }
  if (ext === ".pdf") {
    try {
      const spotlight = execFileSync("/usr/bin/mdls", ["-raw", "-name", "kMDItemTextContent", filePath], {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 8
      });
      const text = normalizeKnowledgeText(spotlight === "(null)" ? "" : spotlight);
      if (text) return text;
    } catch {}
    try {
      const stringsOutput = execFileSync("/usr/bin/strings", [filePath], {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 8
      });
      const text = normalizeKnowledgeText(stringsOutput);
      if (text) return text;
    } catch {}
    throw new Error("PDF 暂时无法可靠提取文本，请优先导出为 txt、md 或 docx 后再导入");
  }
  try {
    return normalizeKnowledgeText(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`暂不支持解析该文件类型：${ext || "未知类型"}`);
  }
}

module.exports = {
  normalizeKnowledgeText,
  extractKnowledgeFileText
};
