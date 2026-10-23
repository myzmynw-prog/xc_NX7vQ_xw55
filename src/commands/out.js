/**
 * DAVID V1 — /out — خروج البوت من الغروب
 * Copyright © 2025 DJAMEL
 * Ported from WHITE-V3 & adapted for DAVID engine
 */
"use strict";

module.exports = {
  config: {
    name: "out",
    aliases: ["leave", "اخرج", "غادر"],
    version: "2.0",
    author: "DJAMEL",
    countDown: 5,
    role: 3,
    category: "management",
    description: "إخراج البوت من الغروب الحالي",
    guide: { en: "{pn} — خروج من الغروب الحالي" }
  },

  onStart: async function ({ api, event, message }) {
    const botID   = api.getCurrentUserID?.() || global.GoatBot?.botID;
    const tid     = event.threadID;

    await message.reply(
      "╔══════════════════════════╗\n" +
      "║  👋 وداعاً يا أصدقاء!  ║\n" +
      "║  البوت مغادر الآن...    ║\n" +
      "╚══════════════════════════╝"
    );

    try {
      await new Promise(r => setTimeout(r, 1500));
      await new Promise((res, rej) =>
        api.removeUserFromGroup(String(botID), tid, (e) => e ? rej(e) : res())
      );
    } catch (e) {
      return message.reply(
        "╔══════════════════════════╗\n" +
        "║  ❌ فشل الخروج          ║\n" +
        "╠══════════════════════════╣\n" +
        "║  تأكد من أن البوت أدمن ║\n" +
        "╚══════════════════════════╝"
      );
    }
  }
};
