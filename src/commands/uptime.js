/**
 * 🏴‍☠️ Devil Zamasu — Black Status
 */

"use strict";

const os = require("os");

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];

  if (days > 0) parts.push(`${days}D`);
  if (hours > 0) parts.push(`${hours}H`);
  if (minutes > 0) parts.push(`${minutes}M`);

  parts.push(`${secs}S`);

  return parts.join(" ");
}

function formatMemory(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function formatSystemMemory(bytes) {
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + " GB";
}

module.exports = {
  config: {
    name: "uptime",
    aliases: ["up", "ping", "وقت"],
    version: "3.0",
    author: "DEVIL ZAMASU",
    countDown: 5,
    role: 2,
    category: "info",
    description: "عرض معلومات البوت الحقيقية",
    guide: {
      en: "{pn}"
    }
  },

  onStart: async function ({ message }) {
    const startTime = global.GoatBot?.startTime;

    const uptime = startTime
      ? formatUptime(Date.now() - startTime)
      : "غير متوفر";

    const memory = process.memoryUsage();

    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    const commandCount =
      global.GoatBot?.commands?.size ?? "غير متوفر";

    const botID =
      global.GoatBot?.botID ?? "غير متوفر";

    const prefix =
      global.GoatBot?.config?.prefix ?? "/";

    const pingStart = Date.now();

    await new Promise(resolve => setTimeout(resolve, 10));

    const ping = Date.now() - pingStart;

    const status = [
      "╔══════════════════════════════════╗",
      "║                                  ║",
      "║       🏴‍☠️ 𝑫𝑬𝑽𝑰𝑳 𝒁𝑨𝑴𝑨𝑺𝑼 🏴‍☠️       ║",
      "║        ⚫ 𝑩𝑳𝑨𝑪𝑲 𝑺𝑻𝑨𝑻𝑼𝑺 ⚫        ║",
      "║                                  ║",
      "╠══════════════════════════════════╣",
      "║                                  ║",
      `║  🏴‍☠️ Bot ID    : ${botID}`,
      `║  ☠ Uptime    : ${uptime}`,
      `║  ⚡ Ping      : ${ping} ms`,
      `║  🕷 Commands  : ${commandCount}`,
      `║  🏴‍☠️ RAM Used  : ${formatMemory(memory.rss)}`,
      `║  💻 RAM Total : ${formatSystemMemory(totalMemory)}`,
      `║  ⚫ RAM Free  : ${formatSystemMemory(freeMemory)}`,
      `║  🏴‍☠️ RAM Used  : ${formatSystemMemory(usedMemory)}`,
      `║  🔓 Prefix    : ${prefix}`,
      "║  🛡 Security  : معلومات غير متوفرة",
      "║                                  ║",
      "╠══════════════════════════════════╣",
      "║                                  ║",
      "║      ⚫ 𝑻𝑯𝑬 𝑩𝑳𝑨𝑪𝑲 𝑲𝑰𝑵𝑮 ⚫      ║",
      "║       ☠ 𝑫𝑬𝑽𝑰𝑳 𝒁𝑨𝑴𝑨𝑺𝑼 ☠       ║",
      "║                                  ║",
      "║       🏴‍☠️ 𝑺𝒀𝑺𝑻𝑬𝑴 𝑨𝑪𝑻𝑰𝑽𝑬 🏴‍☠️       ║",
      "║                                  ║",
      "╚══════════════════════════════════╝"
    ];

    return message.reply(status.join("\n"));
  }
};
