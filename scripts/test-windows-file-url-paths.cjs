const assert = require("node:assert/strict");
const {
  fileUrlFromLocalPath,
  localPathFromFileUrl
} = require("../electron/main/utils/paths.cjs");

const casesFromUrl = [
  ["file:///C:/Users/test/Pictures/a%20b.png", "C:\\Users\\test\\Pictures\\a b.png"],
  ["file://localhost/C:/Users/test/Pictures/a%20b.png", "C:\\Users\\test\\Pictures\\a b.png"],
  ["file://server/share/a%20b.mp4", "\\\\server\\share\\a b.mp4"],
  ["file:///Users/test/a%20b.png", "/Users/test/a b.png"]
];

for (const [input, expected] of casesFromUrl) {
  assert.equal(localPathFromFileUrl(input), expected, `${input} should become ${expected}`);
}

const casesToUrl = [
  ["C:\\Users\\test\\Pictures\\a b.png", "file:///C:/Users/test/Pictures/a%20b.png"],
  ["C:/Users/test/Pictures/a#b.png", "file:///C:/Users/test/Pictures/a%23b.png"],
  ["\\\\server\\share\\a b.mp4", "file://server/share/a%20b.mp4"],
  ["/Users/test/a b.png", "file:///Users/test/a%20b.png"]
];

for (const [input, expected] of casesToUrl) {
  assert.equal(fileUrlFromLocalPath(input), expected, `${input} should become ${expected}`);
}

console.log("windows file URL path conversion passed");
