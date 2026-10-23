/**
 * Alox — /uid — معرفة ID الفيسبوك
 * Ported from WHITE-V3 & adapted for DAVID engine
 */
"use strict";

module.exports = {
  config: {
    name: "uid",
    aliases: ["id", "userid", "معرف"],
    version: "2.0",
    author: "Alox",
    countDown: 3,
    role: 0,
    category: "utility",
    description: "الحصول على معرف Facebook لشخص ما",
    guide: { en: "{pn} — معرفك / رد على رسالة شخص / @tag" }
  },

  onStart: async function ({ api, event, message }) {
    const { senderID, mentions, messageReply, threadID } = event;

    let targetID = senderID;
    let label = "معرفك";

    const taggedIDs = Object.keys(mentions || {});

    if (taggedIDs.length) {
      targetID = taggedIDs[0];
      label = mentions[targetID] || "الشخص المُشار إليه";
    } else if (messageReply) {
      targetID = messageReply.senderID;
      label = "الشخص الذي رددت عليه";
    }

    const LINE = "╠══════════════════════════════╣";

    return message.reply(
`╔══════════════════════════════╗
║  🏴‍☠️ 𝑫𝑬𝑽𝑰𝑳 𝒁𝑨𝑴𝑨𝑺𝑼 🏴‍☠️
║      ⚫ 𝑭𝑨𝑪𝑬𝑩𝑶𝑶𝑲 𝑰𝑫 ⚫
${LINE}
║ 👤 ${label}
║ 🆔 ID : ${targetID}
║ 💬 الغروب : ${threadID}
${LINE}
║      ☠ 𝑩𝑳𝑨𝑪𝑲 𝑲𝑰𝑵𝑮 ☠
╚══════════════════════════════╝`
    );
  }
};
