/**
 * DAVID V1 — /prefix — تغيير بادئة الأوامر
 * Copyright © 2025 DJAMEL
 * Ported from WHITE-V3 & adapted for DAVID engine
 */
"use strict";
const fs   = require("fs-extra");
const path = require("path");

const CONFIG_FILE = path.join(process.cwd(), "config.json");

module.exports = {
  config: {
    name: "prefix",
    aliases: ["بادئة", "setprefix"],
    version: "2.0",
    author: "DJAMEL",
    countDown: 5,
    role: 3,
    category: "management",
    description: "تغيير بادئة الأوامر",
    guide: { en: "{pn} [البادئة الجديدة]\nمثال: {pn} !" }
  },

  onStart: async function ({ event, args, message }) {
    const current = global.GoatBot?.config?.prefix || "/";

    if (!args[0]) {
      return message.reply(
        `╔══════════════════════════╗\n` +
        `║  ⚙️  البادئة الحالية     ║\n` +
        `╠══════════════════════════╣\n` +
        `║  "${current}"\n` +
        `║  /prefix [بادئة جديدة]  ║\n` +
        `╚══════════════════════════╝`
      );
    }

    const newPrefix = args[0].trim();
    if (newPrefix.length > 3) return message.reply("❌ البادئة يجب أن تكون 1-3 أحرف.");

    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
      cfg.prefix = newPrefix;
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
      if (global.GoatBot?.config) global.GoatBot.config.prefix = newPrefix;

      return message.reply(
        `╔══════════════════════════╗\n` +
        `║  ✅ تم تغيير البادئة    ║\n` +
        `╠══════════════════════════╣\n` +
        `║  "${current}" ← "${newPrefix}"\n` +
        `╚══════════════════════════╝`
      );
    } catch (e) {
      return message.reply(`❌ فشل: ${e.message}`);
    }
  }
};
