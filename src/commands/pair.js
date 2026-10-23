/**
 * DAVID V1 — /pair — ربط عشوائي بين عضوين
 * Copyright © 2025 DJAMEL
 * Ported from WHITE-V3 & adapted for DAVID engine
 */
"use strict";
const axios = require("axios");
const fs    = require("fs-extra");
const path  = require("path");
const os    = require("os");

const CACHE_DIR = path.join(os.tmpdir(), "david_pair");

const LOVE_MESSAGES = [
  "تمنياتنا لكما بالسعادة الأبدية 💑",
  "ما أجمل اللقاءات العشوائية! 💕",
  "الحب لا يُخطّط له 😍",
  "مبروك على الزواج الميسر 😂💍",
  "قلب يبحث عن قلب وجده! 🫀",
];

function cleanFile(f) {
  try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
}

async function fetchAvatar(uid, savePath) {
  try {
    const res = await axios.get(
      `https://graph.facebook.com/${uid}/picture?width=512&height=512&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`,
      { responseType: "arraybuffer", timeout: 15000 }
    );
    fs.writeFileSync(savePath, Buffer.from(res.data));
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  config: {
    name: "pair",
    aliases: ["زوج", "حبيبي", "ship"],
    version: "2.0",
    author: "DJAMEL",
    countDown: 10,
    role: 0,
    category: "fun",
    description: "ربط عشوائي بين عضوين من الغروب",
    guide: { en: "{pn} — اختيار عشوائي\n{pn} @شخص — تحديد شخص" }
  },

  onStart: async function ({ api, event, message, args }) {
    const { senderID, threadID, messageID, participantIDs, mentions } = event;

    message.react("💕", messageID);
    fs.ensureDirSync(CACHE_DIR);

    // اختر الطرف الثاني
    const botID  = String(global.GoatBot?.botID || "");
    const tagged = Object.keys(mentions || {});
    let partnerID;

    if (tagged.length && tagged[0] !== senderID) {
      partnerID = tagged[0];
    } else {
      const others = (participantIDs || []).filter(id => String(id) !== botID && String(id) !== String(senderID));
      if (!others.length) return message.reply("❌ لا يوجد أعضاء كافيون في الغروب.");
      partnerID = others[Math.floor(Math.random() * others.length)];
    }

    const percent = Math.floor(Math.random() * 51) + 50; // 50-100%
    const loveMsg = LOVE_MESSAGES[Math.floor(Math.random() * LOVE_MESSAGES.length)];

    // جلب أسماء
    let senderName  = "أنت";
    let partnerName = "الشخص";
    try {
      const info = await new Promise((res, rej) =>
        api.getUserInfo([senderID, partnerID], (err, d) => err ? rej(err) : res(d))
      );
      senderName  = info[senderID]?.name  || senderName;
      partnerName = info[partnerID]?.name || partnerName;
    } catch (_) {}

    // جلب الصور
    const avatarPaths = [
      path.join(CACHE_DIR, `pair_a_${Date.now()}.jpg`),
      path.join(CACHE_DIR, `pair_b_${Date.now() + 1}.jpg`),
    ];

    const [gotA, gotB] = await Promise.all([
      fetchAvatar(senderID,  avatarPaths[0]),
      fetchAvatar(partnerID, avatarPaths[1]),
    ]);

    const attachments = [];
    if (gotA) attachments.push(fs.createReadStream(avatarPaths[0]));
    if (gotB) attachments.push(fs.createReadStream(avatarPaths[1]));

    const body =
      `💞 تم الربط!\n\n` +
      `💕 ${senderName} + ${partnerName}\n` +
      `❤️ نسبة التوافق: ${percent}%\n\n` +
      `${loveMsg}`;

    const mentions_arr = [
      { id: senderID,  tag: senderName  },
      { id: partnerID, tag: partnerName },
    ];

    try {
      await new Promise((resolve, reject) => {
        api.sendMessage(
          { body, mentions: mentions_arr, attachment: attachments.length ? attachments : undefined },
          threadID,
          (err) => {
            avatarPaths.forEach(cleanFile);
            err ? reject(err) : resolve();
          }
        );
      });
    } catch (_) {
      avatarPaths.forEach(cleanFile);
      message.reply(body);
    }
  }
};
