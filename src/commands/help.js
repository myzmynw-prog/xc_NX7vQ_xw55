/**
 * 🏴‍☠️ Devil Zamasu — Black Help Menu
 */

"use strict";

const CATEGORIES = [
  {
    icon: "⚔️",
    title: "الإدارة والتحكم",
    cmds: [
      { name: "addadmin", icon: "👑", desc: "إدارة أدمن البوت" },
      { name: "addlock", icon: "⛓️", desc: "قفل عدد أعضاء الغروب" },
      { name: "groupimg", icon: "🖼️", desc: "تغيير وقفل صورة الغروب" },
      { name: "lock", icon: "🔒", desc: "قفل البوت للأدمن فقط" },
      { name: "nick", icon: "🪶", desc: "قفل كنيات الأعضاء باستمرار" },
      { name: "nm", icon: "🗝️", desc: "قفل اسم الغروب ومنع تغييره" },
      { name: "out", icon: "🚪", desc: "إخراج البوت من الغروب" }
    ]
  },

  {
    icon: "🕸️",
    title: "إدارة الأعضاء",
    cmds: [
      { name: "adduser", icon: "➕", desc: "إضافة عضو إلى الغروب" },
      { name: "pair", icon: "🔗", desc: "ربط عشوائي بين عضوين" }
    ]
  },

  {
    icon: "🐦‍🔥",
    title: "الرسائل التلقائية",
    cmds: [
      { name: "damon", icon: "🐦‍🔥", desc: "إرسال رسائل دورية للغروب" }
    ]
  },

  {
    icon: "🛠️",
    title: "الأدوات والمعلومات",
    cmds: [
      { name: "uid", icon: "🆔", desc: "معرفة معرف فيسبوك" },
      { name: "unsend", icon: "🧹", desc: "حذف آخر رسالة للبوت" },
      { name: "uptime", icon: "⏳", desc: "عرض وقت تشغيل البوت" },
      { name: "chats", icon: "🗃️", desc: "إدارة المحادثات والغروبات" }
    ]
  },

  {
    icon: "☠️",
    title: "النظام",
    cmds: [
      { name: "prefix", icon: "🔐", desc: "تغيير بادئة الأوامر" },
      { name: "help", icon: "📜", desc: "عرض قائمة الأوامر" }
    ]
  }
];

const DETAILS = {
  addadmin: "/addadmin [1-3] @tag / list / remove [ID]",

  addlock: "/addlock on|off|status|list|clear",

  adduser: "/adduser [ID أو رابط]",

  chats: "/chats — إدارة المحادثات والغروبات",

  damon: "/damon [رسالة] [min-max ثانية] / off / status",

  groupimg: "/groupimg [رابط أو صورة] / off / status",

  help: "/help — عرض قائمة الأوامر\n/help [اسم الأمر] — شرح أمر معين",

  lock: "/lock — قفل البوت\n/lock off — إلغاء القفل",

  nick: "/nick [اسم] / off / status",

  nm: "/nm [اسم] / off / time [min] [max] / status",

  out: "/out — خروج البوت من الغروب الحالي",

  pair: "/pair — اختيار عشوائي / @شخص",

  prefix: "/prefix [البادئة الجديدة]",

  uid: "/uid — معرفك / الرد على رسالة / @tag",

  unsend: "/unsend — حذف آخر رسالة للبوت",

  uptime: "/uptime — عرض وقت تشغيل البوت"
};

function normalizePrefix(prefix) {
  return typeof prefix === "string" && prefix.trim()
    ? prefix.trim()
    : "/";
}

function getDetail(command) {
  const key = String(command).trim().toLowerCase();

  const foundKey = Object.keys(DETAILS).find(
    name => name.toLowerCase() === key
  );

  return foundKey ? DETAILS[foundKey] : null;
}

function buildHelp(prefix) {
  let text = "";

  text += "╔══════════════════════════════════╗\n";
  text += "║                                  ║\n";
  text += "║      🏴‍☠️ 𝑫𝑬𝑽𝑰𝑳 𝒁𝑨𝑴𝑨𝑺𝑼 🏴‍☠️      ║\n";
  text += "║        ⚫ 𝑩𝑳𝑨𝑪𝑲 𝑴𝑬𝑵𝑼 ⚫         ║\n";
  text += "║                                  ║\n";
  text += "╠══════════════════════════════════╣\n";
  text += "║                                  ║\n";

  for (const category of CATEGORIES) {
    text += `║ ${category.icon} ${category.title}\n`;
    text += "║ ════════════════════════════════\n";

    for (const cmd of category.cmds) {
      text += `║ ${cmd.icon} ${prefix}${cmd.name}\n`;
      text += `║    └─ ${cmd.desc}\n`;
    }

    text += "║                                  ║\n";
  }

  text += "╠══════════════════════════════════╣\n";
  text += "║                                  ║\n";
  text += `║ 🏴‍☠️ ${prefix}help [الأمر]\n`;
  text += "║ 📚 شرح أي أمر بالتفصيل\n";
  text += "║                                  ║\n";
  text += "║       ⚫ 𝑩𝑳𝑨𝑪𝑲 𝑲𝑰𝑵𝑮 ⚫          ║\n";
  text += "║       ☠ 𝑫𝑬𝑽𝑰𝑳 𝒁𝑨𝑴𝑨𝑺𝑼 ☠        ║\n";
  text += "║                                  ║\n";
  text += "║       🏴‍☠️ 𝑺𝒀𝑺𝑻𝑬𝑴 𝑨𝑪𝑻𝑰𝑽𝑬 🏴‍☠️       ║\n";
  text += "║                                  ║\n";
  text += "╚══════════════════════════════════╝";

  return text;
}

function buildDetails(prefix, command) {
  const detail = getDetail(command);

  if (!detail) {
    return (
      "╔══════════════════════════════════╗\n" +
      "║                                  ║\n" +
      "║       🏴‍☠️ 𝑬𝑹𝑹𝑶𝑹 ⚫             ║\n" +
      "║                                  ║\n" +
      `║ ❌ الأمر "${command}" غير موجود\n` +
      "║                                  ║\n" +
      `║ استخدم ${prefix}help لعرض الأوامر\n` +
      "║                                  ║\n" +
      "╚══════════════════════════════════╝"
    );
  }

  return (
    "╔══════════════════════════════════╗\n" +
    "║                                  ║\n" +
    "║      🏴‍☠️ 𝑫𝑬𝑽𝑰𝑳 𝒁𝑨𝑴𝑨𝑺𝑼 🏴‍☠️      ║\n" +
    "║        ⚫ 𝑪𝑶𝑴𝑴𝑨𝑵𝑫 𝑰𝑵𝑭𝑶 ⚫        ║\n" +
    "║                                  ║\n" +
    "╠══════════════════════════════════╣\n" +
    "║                                  ║\n" +
    `║ 📜 الأمر: ${prefix}${command}\n` +
    "║                                  ║\n" +
    "║ 🔻 طريقة الاستخدام:\n" +
    `║ ${detail}\n` +
    "║                                  ║\n" +
    "╠══════════════════════════════════╣\n" +
    "║                                  ║\n" +
    "║       ⚫ 𝑩𝑳𝑨𝑪𝑲 𝑲𝑰𝑵𝑮 ⚫          ║\n" +
    "║       ☠ 𝑫𝑬𝑽𝑰𝑳 𝒁𝑨𝑴𝑨𝑺𝑼 ☠        ║\n" +
    "║                                  ║\n" +
    "╚══════════════════════════════════╝"
  );
}

module.exports = {
  config: {
    name: "help",

    aliases: [
      "h",
      "commands",
      "مساعدة",
      "اوامر"
    ],

    version: "7.0",
    author: "𝒁𝑨𝑴𝑨𝑺𝑼",
    countDown: 3,
    role: 0,
    category: "utility",
    description: "عرض قائمة أوامر البوت",

    guide: {
      en:
        "{pn} — عرض جميع الأوامر\n" +
        "{pn} [اسم الأمر] — شرح أمر معين"
    }
  },

  onStart: async function ({
    api,
    event,
    args,
    message,
    prefix
  }) {

    const realPrefix =
      normalizePrefix(
        prefix ||
        global.GoatBot?.config?.prefix ||
        "/"
      );

    const command =
      args?.join(" ").trim();

    if (command) {
      return message.reply(
        buildDetails(
          realPrefix,
          command
        )
      );
    }

    return message.reply(
      buildHelp(realPrefix)
    );
  }
};
