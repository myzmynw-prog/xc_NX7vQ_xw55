/**
 * DAVID V1 — /groupimg — تغيير وقفل صورة الغروب
 * Copyright © 2025 DJAMEL — v5.0 Fixed
 * Fixed:
 *  - shim لـ parseAndCheckLogin (بعض إصدارات FCA تحتاجه)
 *  - منع حلقة لانهائية: تجاهل تغييرات البوت نفسه
 *  - حماية ضد تشغيل متزامن لنفس الغروب
 *  - إعادة محاولة 3 مرات بفاصل تصاعدي
 */
"use strict";
const axios = require("axios");
const fs    = require("fs-extra");
const path  = require("path");
const os    = require("os");

// ── Shim لـ parseAndCheckLogin (يحل مشكلة بعض إصدارات fca-eryxenx) ──────────
try {
  require(path.join(process.cwd(), "bot/utils/parseAndCheckLogin"));
} catch (_) {
  if (typeof global.parseAndCheckLogin === "undefined") {
    global.parseAndCheckLogin = function parseAndCheckLogin(ctx, http, retryCount = 0) {
      return async function handleResponse(res) {
        const body = res?.data;
        if (body == null) return body;
        if (typeof body === "object") return body;
        try { return JSON.parse(String(body).replace(/^[^{[]*/, "")); } catch (_) { return body; }
      };
    };
  }
}

// ── مسارات الملفات ────────────────────────────────────────────────────────────
const CACHE      = path.join(os.tmpdir(), "groupimg_locks");
const STATE_FILE = path.join(process.cwd(), "database", "data", "groupImgLocks.json");
fs.ensureDirSync(CACHE);
fs.ensureDirSync(path.dirname(STATE_FILE));

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE))
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch (_) {}
  return {};
}
function saveState(state) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); } catch (_) {}
}

if (!global._groupImgState) global._groupImgState = loadState();
const locks = global._groupImgState;

function lockFile(tid) {
  return path.join(CACHE, `groupimg_lock_${String(tid).replace(/[^0-9]/g, "")}.jpg`);
}

function isBotAdmin(id) {
  const cfg = global.GoatBot?.config || {};
  const sid = String(id);
  const owners = [cfg.ownerID, ...(cfg.superAdminBot || [])].filter(Boolean).map(String);
  const admins = (cfg.adminBot || []).map(String);
  return owners.includes(sid) || admins.includes(sid);
}

async function isGroupAdmin(api, uid, tid) {
  try {
    const info = await new Promise((res, rej) =>
      api.getThreadInfo(tid, (e, d) => e ? rej(e) : res(d))
    );
    return (info?.adminIDs || []).some(a => String(a.id || a) === String(uid));
  } catch (_) { return false; }
}

async function downloadImage(url) {
  const tmpFile = path.join(CACHE, `tmp_${Date.now()}.jpg`);
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 25000,
    maxRedirects: 5,
    headers: {
      "User-Agent": "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36",
      "Accept": "image/*,*/*;q=0.8"
    }
  });
  fs.writeFileSync(tmpFile, Buffer.from(res.data));
  return tmpFile;
}

/** تطبيق صورة القفل على الغروب بصمت */
async function applyImage(api, tid) {
  const lf = lockFile(tid);
  if (!fs.existsSync(lf)) return;
  try {
    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(lf);
      stream.on("error", reject);
      api.changeGroupImage(stream, String(tid), (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } catch (e) {
    if (global.log) global.log.warn("GROUPIMG", `فشل تطبيق الصورة: ${e.message}`);
  }
}

function isImageChangeEvent(event) {
  return (
    event.logMessageType === "log:thread-image" ||
    event.type           === "log:thread-image" ||
    (event.type === "event" && event.logMessageType === "log:thread-image")
  );
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  config: {
    name: "groupimg",
    aliases: ["gcimg", "صورة", "img"],
    version: "5.0",
    author: "DJAMEL",
    countDown: 5,
    role: 2,
    category: "management",
    description: "تغيير وقفل صورة الغروب تلقائياً",
    guide: {
      en: "{pn} [رابط أو صورة] — تغيير وقفل\n{pn} off — فك القفل\n{pn} status — الحالة"
    }
  },

  onStart: async function ({ api, event, args, message }) {
    const tid = String(event.threadID);
    const uid = event.senderID;

    if (!isBotAdmin(uid) && !(await isGroupAdmin(api, uid, tid)))
      return message.reply("⛔ هذا الأمر للأدمن فقط.");

    const sub = (args[0] || "").toLowerCase();

    // ── /groupimg off ────────────────────────────────────────────────────
    if (sub === "off" || sub === "إيقاف") {
      locks[tid] = false;
      saveState(locks);
      const lf = lockFile(tid);
      if (fs.existsSync(lf)) try { fs.removeSync(lf); } catch (_) {}
      return message.reply(
        "╔══════════════════════════════╗\n" +
        "║  🔓 تم فك قفل صورة الغروب  ║\n" +
        "║  يمكن الآن تغييرها بحرية   ║\n" +
        "╚══════════════════════════════╝"
      );
    }

    // ── /groupimg status ─────────────────────────────────────────────────
    if (sub === "status" || sub === "حالة") {
      const locked = locks[tid] === true && fs.existsSync(lockFile(tid));
      return message.reply(
        locked
          ? "╔══════════════════════════════╗\n" +
            "║  🔒 صورة الغروب مقفلة       ║\n" +
            "║  /groupimg off لفك القفل    ║\n" +
            "╚══════════════════════════════╝"
          : "╔══════════════════════════════╗\n" +
            "║  🔓 صورة الغروب غير مقفلة  ║\n" +
            "╚══════════════════════════════╝"
      );
    }

    // ── جلب رابط الصورة ──────────────────────────────────────────────────
    let imageUrl = null;
    const replyAttach = event.messageReply?.attachments?.[0];
    if (replyAttach?.type === "photo")
      imageUrl = replyAttach.url || replyAttach.previewUrl || replyAttach.thumbnailUrl;

    if (!imageUrl) {
      const direct = (event.attachments || []).find(a => a.type === "photo");
      if (direct) imageUrl = direct.url || direct.previewUrl || direct.thumbnailUrl;
    }

    if (!imageUrl)
      for (const a of args)
        if (a?.startsWith("http://") || a?.startsWith("https://")) { imageUrl = a; break; }

    if (!imageUrl) {
      return message.reply(
        "╔═══════════════════════════════╗\n" +
        "║  🖼️  تغيير صورة الغروب       ║\n" +
        "╠═══════════════════════════════╣\n" +
        "║  الاستخدام:                  ║\n" +
        "║  • /groupimg [رابط صورة]    ║\n" +
        "║  • أرسل صورة مع الأمر       ║\n" +
        "║  • رد على صورة بالأمر       ║\n" +
        "╠═══════════════════════════════╣\n" +
        "║  /groupimg off   — فك القفل ║\n" +
        "║  /groupimg status — الحالة  ║\n" +
        "╚═══════════════════════════════╝"
      );
    }

    message.react("⏳", event.messageID);

    try {
      const tmpPath = await downloadImage(imageUrl);
      const lf = lockFile(tid);
      fs.copySync(tmpPath, lf);
      try { fs.removeSync(tmpPath); } catch (_) {}

      await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(lf);
        stream.on("error", reject);
        api.changeGroupImage(stream, tid, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      locks[tid] = true;
      saveState(locks);

      message.react("✅", event.messageID);
      return message.reply(
        "╔═══════════════════════════════╗\n" +
        "║  ✅ تم تغيير الصورة وقفلها  ║\n" +
        "╠═══════════════════════════════╣\n" +
        "║  🔒 الصورة محمية الآن       ║\n" +
        "║  ستُعاد تلقائياً عند التغيير║\n" +
        "║  /groupimg off لفك القفل    ║\n" +
        "╚═══════════════════════════════╝"
      );
    } catch (e) {
      message.react("❌", event.messageID);
      return message.reply(
        "╔═══════════════════════════════╗\n" +
        "║  ❌ فشل تغيير الصورة         ║\n" +
        "╠═══════════════════════════════╣\n" +
        "║  " + String(e.message || e).slice(0, 32) + "\n" +
        "╠═══════════════════════════════╣\n" +
        "║  تأكد من:                    ║\n" +
        "║  • أن البوت أدمن في الغروب ║\n" +
        "║  • أن رابط الصورة صحيح     ║\n" +
        "╚═══════════════════════════════╝"
      );
    }
  },

  onEvent: async function ({ api, event }) {
    if (!isImageChangeEvent(event)) return;
    const tid   = String(event.threadID);
    const botID = String(api.getCurrentUserID?.() || global.GoatBot?.botID || "");

    // FIX: تجاهل التغييرات التي أحدثها البوت نفسه (منع الحلقة اللانهائية)
    if (botID && String(event.author || event.senderID) === botID) return;

    if (locks[tid] !== true) return;
    const lf = lockFile(tid);
    if (!fs.existsSync(lf)) return;

    // FIX: منع تشغيل أكثر من عملية لنفس الغروب في نفس الوقت
    if (!global._groupImgLocking) global._groupImgLocking = new Set();
    if (global._groupImgLocking.has(tid)) return;
    global._groupImgLocking.add(tid);

    // انتظر 5 ثوانٍ ثم أعد التطبيق مع 3 محاولات
    await new Promise(r => setTimeout(r, 5000));

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (!fs.existsSync(lf)) break;   // تم فك القفل أثناء الانتظار
        await applyImage(api, tid);
        break;
      } catch (_) {
        if (attempt < 3) await new Promise(r => setTimeout(r, 4000 * attempt));
      }
    }

    global._groupImgLocking.delete(tid);
  }
};
