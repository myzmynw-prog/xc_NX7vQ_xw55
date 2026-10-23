"use strict";

const fs = require("fs-extra");
const path = require("path");

const DATA = path.join(process.cwd(), "database/data/cmdControl.json");

function load() {
  try {
    if (!fs.existsSync(DATA)) return {};
    const value = JSON.parse(fs.readFileSync(DATA, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch (_) { return {}; }
}

function save(value) {
  fs.ensureDirSync(path.dirname(DATA));
  fs.writeFileSync(DATA, JSON.stringify(value, null, 2), "utf8");
}

function isEnabled(threadID, command) {
  const data = load();
  return data[String(threadID)]?.[String(command).toLowerCase()] === true;
}

function setCommandEnabled(threadID, command, enabled) {
  const data = load();
  const tid = String(threadID);
  if (!data[tid]) data[tid] = {};
  data[tid][String(command).toLowerCase()] = !!enabled;
  save(data);
  return !!enabled;
}

module.exports = {
  isEnabled,
  setCommandEnabled,
  enable: (threadID, command) => setCommandEnabled(threadID, command, true),
  disable: (threadID, command) => setCommandEnabled(threadID, command, false),
};
