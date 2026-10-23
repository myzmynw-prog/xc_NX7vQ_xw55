/**
 * FALCON V1 — /lock
 * 🔒 قفل البوت للأدمن فقط
 */

"use strict";

module.exports = {
  config: {
    name: "lock",
    aliases: [],
    version: "1.0",
    author: "Falcon",
    countDown: 3,
    role: 2,
    category: "management",
    description: "قفل البوت ومنع غير الأدمن من استخدامه",
    guide: {
      en: "{pn} | {pn} off"
    }
  },

  onStart: async function ({ message, args }) {

    // إنشاء حالة القفل إذا لم تكن موجودة
    if (typeof global.FalconBotLocked !== "boolean") {
      global.FalconBotLocked = false;
    }

    const option = String(args[0] || "").toLowerCase();

    // /lock off
    if (
      option === "off" ||
      option === "إيقاف" ||
      option === "فتح"
    ) {
      global.FalconBotLocked = false;

      return message.reply(
        "🔓 تم إلغاء قفل البوت.\n" +
        "✅ الآن يمكن للجميع استخدام البوت."
      );
    }

    // /lock
    global.FalconBotLocked = true;

    return message.reply(
      "🔒 تم وضع قفل على البوت.\n" +
      "⚠️ لن يرد البوت على من لا يملك صلاحية أدمن."
    );
  }
};
