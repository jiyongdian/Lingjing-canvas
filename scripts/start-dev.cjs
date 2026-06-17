#!/usr/bin/env node

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const userDataPath = path.join(projectRoot, ".wanjuan-dev-user-data");

fs.mkdirSync(userDataPath, { recursive: true });

const electronPath = require("electron");
const child = spawn(electronPath, [projectRoot], {
  cwd: projectRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    WANJUAN_TEST_USER_DATA_PATH: userDataPath,
    WANJUAN_ALLOW_RANDOM_PORT: "1",
    WANJUAN_DISABLE_UPDATE_CHECK: "1",
  },
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
