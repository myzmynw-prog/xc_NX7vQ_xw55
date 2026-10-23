/**
 * 🏴‍☠️ Devil Zamasu — /addadmin
 */
"use strict";

const fs = require("fs-extra");
const path = require("path");

const LEVELS_FILE = path.join(
  process.cwd(),
  "database",
  "data",
  "adminLevels.json"
);

const CONFIG_FILE = path.join(process.cwd(), "config.json");

function loadLevels() {
  try {
    if (fs.existsSync(LEVELS_FILE)) {
      return JSON.parse(
        fs.readFileSync(LEVELS_FILE, "utf8")
      );
    }
  } catch (_) {}

  return {};
}

function saveLevels(data) {
  fs.ensureDirSync(path.dirname(LEVELS_FILE));
  fs.writeFileSync(
    LEVELS_FILE,
    JSON.stringify(data, null, 2)
  );
}

function isTopAdmin(id) {
  const sid = String(id);
  const levels = loadLevels();

  if (levels[sid] !== undefined) {
    return levels[sid] === 3;
  }

  const cfg = global.GoatBot?.config || {};

  const superKeys = [
    "ownerID",
    "OWNER_IDS",
    "superAdminBot",
    "NDO_OWNER",
    "owner"
  ];

  const supers = [];

  for (const k of superKeys) {
    if (Array.isArray(cfg[k])) {
      supers.push(...cfg[k]);
    } else if (cfg[k]) {
      supers.push(cfg[k]);
    }
  }

  return supers.map(String).includes(sid);
}

function extractID(text) {
  if (!text) return null;

  const m1 = text.match(
    /(?:facebook\.com|fb\.com)\/profile\.php\?id=(\d+)/i
  );

  if (m1) return m1[1];

  const m2 = text.match(
    /(?:facebook\.com|fb\.com)\/(\d+)/i
  );

  if (m2) return m2[1];

  if (/^\d{5,20}$/.test(text.trim())) {
    return text.trim();
  }

  return null;
}

function updateConfigAdmin(targetID, action, level = 2) {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return;

    const cfg = JSON.parse(
      fs.readFileSync(CONFIG_FILE, "utf8")
    );

    const sid = String(targetID);

    const adminKey =
      cfg.NDO_ADMIN !== undefined
        ? "NDO_ADMIN"
        : cfg.ADMIN_IDS !== undefined
          ? "ADMIN_IDS"
          : "adminBot";

    const superKey =
      cfg.NDO_OWNER !== undefined
        ? "NDO_OWNER"
        : cfg.OWNER_IDS !== undefined
          ? "OWNER_IDS"
          : "superAdminBot";

    if (!Array.isArray(cfg[adminKey])) {
      cfg[adminKey] = [];
    }

    if (!Array.isArray(cfg[superKey])) {
      cfg[superKey] = [];
    }

    if (action === "add") {
      if (level === 3) {
        if (!cfg[superKey].map(String).includes(sid)) {
          cfg[superKey].push(sid);
        }
      } else {
        if (!cfg[adminKey].map(String).includes(sid)) {
          cfg[adminKey].push(sid);
        }
      }
    }

    if (action === "remove") {
      cfg[adminKey] = cfg[adminKey].filter(
        id => String(id) !== sid
      );

      cfg[superKey] = cfg[superKey].filter(
        id => String(id) !== sid
      );
    }

    fs.writeFileSync(
      CONFIG_FILE,
      JSON.stringify(cfg, null, 2),
      "utf8"
    );

    if (global.GoatBot?.config) {
      global.GoatBot.config[adminKey] = cfg[adminKey];
      global.GoatBot.config[superKey] = cfg[superKey];
    }

  } catch (err) {
    console.error(
      "❌ خطأ أثناء تحديث config.json:",
      err.message
    );
  }
}

module.exports = {
  config: {
    name: "addadmin",
    aliases: [
      "addmod",
      "إضافة-أدمن",
      "أدمن"
    ],
    version: "2.2",
    author: "Devil Zamasu",
    countDown: 5,
    role: 3,
    category: "management",
    description: "إضافة أو تعديل أدمن بوت بمستوى معين",
    guide: {
      ar:
        "{pn} [1-3] @tag\n" +
        "{pn} [1-3] [ID]\n" +
        "{pn} [1-3] — رد على رسالة\n" +
        "{pn} list — قائمة الأدمن\n" +
        "{pn} remove [ID] — إزالة أدمن"
    }
  },

  onStart: async function ({
    api,
    event,
    args,
    message
  }) {

    const {
      senderID,
      mentions,
      messageReply
    } = event;

    if (!isTopAdmin(senderID)) {
      return message.reply(
        "⛔ هذا الأمر لمالك البوت (المستوى 3) فقط."
      );
    }

    const sub = (args[0] || "").toLowerCase();

    /*
     * قائمة الأدمن
     */
    if (sub === "list" || sub === "قائمة") {

      const levels = loadLevels();
      const cfg = global.GoatBot?.config || {};

      const supers = [
        cfg.ownerID,
        ...(cfg.superAdminBot || []),
        ...(cfg.NDO_OWNER || [])
      ]
        .filter(Boolean)
        .map(String);

      if (
        !Object.keys(levels).length &&
        !supers.length
      ) {
        return message.reply(
          "📋 لا يوجد أدمن مسجّل."
        );
      }

      const lines = [
        "╔══════════════════════════════════╗",
        "║                                  ║",
        "║      🏴‍☠️ 𝑫𝑬𝑽𝑰𝑳 𝒁𝑨𝑴𝑨𝑺𝑼 🏴‍☠️      ║",
        "║        ⚫ 𝑨𝑫𝑴𝑰𝑵 𝑳𝑰𝑺𝑻 ⚫        ║",
        "║                                  ║",
        "╠══════════════════════════════════╣",
        "║                                  ║"
      ];

      const emoji = {
        3: "👹",
        2: "🤴🏻",
        1: "👿"
      };

      const labels = {
        3: "Leader",
        2: "King",
        1: "Satan"
      };

      for (const [id, lvl] of Object.entries(levels)) {
        lines.push(
          `║ ${emoji[lvl] || "•"} Lv${lvl} — ${labels[lvl] || "Unknown"}`
        );
        lines.push(
          `║    🆔 ${id}`
        );
      }

      for (const id of supers) {
        if (!levels[id]) {
          lines.push(
            `║ 👹 Owner — ${id}`
          );
        }
      }

      lines.push(
        "║                                  ║",
        "╠══════════════════════════════════╣",
        "║ 👿 Lv1 — Satan                   ║",
        "║ 🤴🏻 Lv2 — King                   ║",
        "║ 👹 Lv3 — Leader                  ║",
        "║                                  ║",
        "╚══════════════════════════════════╝"
      );

      return message.reply(
        lines.join("\n")
      );
    }

    /*
     * إزالة أدمن
     */
    if (
      sub === "remove" ||
      sub === "إزالة"
    ) {

      const rid =
        args[1]
          ? extractID(args[1])
          : (
              messageReply?.senderID ||
              Object.keys(mentions || {})[0]
            );

      if (!rid) {
        return message.reply(
          "❌ حدد ID الشخص المراد إزالته."
        );
      }

      const levels = loadLevels();

      if (!levels[String(rid)]) {
        return message.reply(
          `⚠️ المعرف ${rid} ليس أدمناً في قاعدة البيانات.`
        );
      }

      delete levels[String(rid)];

      saveLevels(levels);

      updateConfigAdmin(
        rid,
        "remove"
      );

      return message.reply(
        `╔══════════════════════════════════╗\n` +
        `║                                  ║\n` +
        `║      🏴‍☠️ 𝑫𝑬𝑽𝑰𝑳 𝒁𝑨𝑴𝑨𝑺𝑼 🏴‍☠️      ║\n` +
        `║        ⚫ 𝑨𝑫𝑴𝑰𝑵 𝑹𝑬𝑴𝑶𝑽𝑬 ⚫        ║\n` +
        `║                                  ║\n` +
        `╠══════════════════════════════════╣\n` +
        `║                                  ║\n` +
        `║ 🗑️ تم إزالة الأدمن\n` +
        `║ 🆔 ID: ${rid}\n` +
        `║                                  ║\n` +
        `╚══════════════════════════════════╝`
      );
    }

    /*
     * التحقق من المستوى
     */
    const level = parseInt(sub);

    if (
      isNaN(level) ||
      level < 1 ||
      level > 3
    ) {

      return message.reply(
        "╔══════════════════════════════════╗\n" +
        "║                                  ║\n" +
        "║      🏴‍☠️ 𝑫𝑬𝑽𝑰𝑳 𝒁𝑨𝑴𝑨𝑺𝑼 🏴‍☠️      ║\n" +
        "║        ⚫ 𝑨𝑫𝑴𝑰𝑵 𝑺𝒀𝑺𝑻𝑬𝑴 ⚫        ║\n" +
        "║                                  ║\n" +
        "╠══════════════════════════════════╣\n" +
        "║                                  ║\n" +
        "║ 👑 إضافة أدمن للبوت              ║\n" +
        "║                                  ║\n" +
        "║ 🗝️ /addadmin 2 @شخص              ║\n" +
        "║ 🆔 /addadmin 1 [ID]              ║\n" +
        "║ 🛡️ /addadmin 3 — رد على رسالة    ║\n" +
        "║ 📋 /addadmin list                ║\n" +
        "║ 🗑️ /addadmin remove [ID]         ║\n" +
        "║                                  ║\n" +
        "╠══════════════════════════════════╣\n" +
        "║                                  ║\n" +
        "║ 👿 Lv1 — Satan                   ║\n" +
        "║ 🤴🏻 Lv2 — King                   ║\n" +
        "║ 👹 Lv3 — Leader                  ║\n" +
        "║                                  ║\n" +
        "╠══════════════════════════════════╣\n" +
        "║                                  ║\n" +
        "║       ⚫ 𝑩𝑳𝑨𝑪𝑲 𝑲𝑰𝑵𝑮 ⚫          ║\n" +
        "║       ☠ 𝑫𝑬𝑽𝑰𝑳 𝒁𝑨𝑴𝑨𝑺𝑼 ☠        ║\n" +
        "║                                  ║\n" +
        "║       🏴‍☠️ 𝑺𝒀𝑺𝑻𝑬𝑴 𝑨𝑪𝑻𝑰𝑽𝑬 🏴‍☠️       ║\n" +
        "║                                  ║\n" +
        "╚══════════════════════════════════╝"
      );
    }

    let targetID = null;

    const taggedIDs =
      Object.keys(mentions || {});

    if (taggedIDs.length) {
      targetID = taggedIDs[0];
    }
    else if (args[1]) {
      targetID = extractID(args[1]);
    }
    else if (messageReply) {
      targetID = messageReply.senderID;
    }

    if (!targetID) {
      return message.reply(
        "❌ حدد الشخص: رد على رسالته، أو @mention، أو ضع ID."
      );
    }

    if (
      String(targetID) ===
      String(senderID)
    ) {
      return message.reply(
        "❌ لا يمكنك إضافة أو تعديل صلاحية نفسك."
      );
    }

    const levels = loadLevels();

    const oldLevel =
      levels[String(targetID)];

    levels[String(targetID)] = level;

    saveLevels(levels);

    updateConfigAdmin(
      targetID,
      "add",
      level
    );

    const emoji = {
      3: "👹",
      2: "🤴🏻",
      1: "👿"
    };

    const labels = {
      3: "Leader",
      2: "King",
      1: "Satan"
    };

    return message.reply(
      "╔══════════════════════════════════╗\n" +
      "║                                  ║\n" +
      "║      🏴‍☠️ 𝑫𝑬𝑽𝑰𝑳 𝒁𝑨𝑴𝑨𝑺𝑼 🏴‍☠️      ║\n" +
      "║        ⚫ 𝑨𝑫𝑴𝑰𝑵 𝑺𝑼𝑪𝑪𝑬𝑺𝑺 ⚫        ║\n" +
      "║                                  ║\n" +
      "╠══════════════════════════════════╣\n" +
      "║                                  ║\n" +
      `║ ${oldLevel ? "🔄 تم تحديث الأدمن" : "✅ تم إضافة أدمن جديد"}\n` +
      `║ 🆔 ID: ${targetID}\n` +
      (
        oldLevel
          ? `║ 📊 Lv${oldLevel} → Lv${level} ${emoji[level]} ${labels[level]}\n`
          : `║ 📊 ${emoji[level]} Lv${level} — ${labels[level]}\n`
      ) +
      "║                                  ║\n" +
      "╠══════════════════════════════════╣\n" +
      "║                                  ║\n" +
      "║ 👿 Lv1 — Satan                   ║\n" +
      "║ 🤴🏻 Lv2 — King                   ║\n" +
      "║ 👹 Lv3 — Leader                  ║\n" +
      "║                                  ║\n" +
      "╚══════════════════════════════════╝"
    );
  }
};
