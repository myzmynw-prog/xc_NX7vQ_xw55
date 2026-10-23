/**
 * 𝒁𝒂𝒎𝒂𝒔𝒖 V1 — /nm — قفل اسم الغروب
 * Copyright © 2025 𝒁𝒂𝒎𝒂𝒔𝒖
 * ✦ يراقب تغيير الاسم ويعيده تلقائياً
 * ✦ /nm [اسم] [ثواني]
 * ✦ /nm off — إيقاف القفل
 */

"use strict";

const fs = require("fs-extra");
const path = require("path");

const DATA = path.join(
  process.cwd(),
  "database/data/nmData.json"
);

function load() {
  try {
    if (fs.existsSync(DATA)) {
      return JSON.parse(
        fs.readFileSync(DATA, "utf8")
      );
    }
  } catch (_) {}

  return {};
}

function save(data) {
  fs.ensureDirSync(path.dirname(DATA));

  fs.writeFileSync(
    DATA,
    JSON.stringify(data, null, 2)
  );
}

// ─────────────────────────────────────────────
// Global state
// ─────────────────────────────────────────────

if (!global._nmLocks)
  global._nmLocks = {};

if (!global._nmTimers)
  global._nmTimers = {};

if (!global._nmRestoring)
  global._nmRestoring = {};

if (!global._nmRestored)
  global._nmRestored = false;

// ─────────────────────────────────────────────
// إيقاف المؤقت
// ─────────────────────────────────────────────

function stopTimer(tid) {
  if (global._nmTimers[tid]) {
    clearTimeout(global._nmTimers[tid]);
    delete global._nmTimers[tid];
  }
}

// ─────────────────────────────────────────────
// تشغيل المؤقت
// ─────────────────────────────────────────────

function startTimer(api, tid) {
  stopTimer(tid);

  const lock = global._nmLocks[tid];

  if (
    !lock ||
    !lock.active ||
    !lock.name
  ) {
    return;
  }

  const seconds =
    Number(lock.delay) > 0
      ? Number(lock.delay)
      : 30;

  global._nmTimers[tid] = setTimeout(
    async () => {

      const current =
        global._nmLocks[tid];

      if (
        !current ||
        !current.active ||
        !current.name
      ) {
        return;
      }

      try {
        await api.setTitle(
          current.name,
          tid
        );
      } catch (_) {}

      // إعادة تشغيل المؤقت
      startTimer(api, tid);

    },
    seconds * 1000
  );
}

// ─────────────────────────────────────────────
// استعادة الأقفال بعد إعادة تشغيل البوت
// ─────────────────────────────────────────────

function restoreAll(api) {
  if (global._nmRestored) return;

  global._nmRestored = true;

  const data = load();

  for (const [tid, lock] of Object.entries(data)) {

    if (
      lock &&
      lock.active &&
      lock.name
    ) {

      global._nmLocks[tid] = lock;

      startTimer(api, tid);
    }
  }
}

// ─────────────────────────────────────────────
// Module
// ─────────────────────────────────────────────

module.exports = {

  config: {
    name: "nm",

    aliases: [
      "namemute",
      "غلق",
      "lockname"
    ],

    version: "3.0",

    author: "𝒁𝒂𝒎𝒂𝒔𝒖",

    countDown: 3,

    role: 2,

    category: "management",

    description:
      "قفل اسم الغروب ومنع تغييره",

    guide: {
      en:
        "{pn} [اسم] [ثواني] — تفعيل قفل الاسم\n" +
        "{pn} off — إيقاف القفل"
    }
  },

  // ───────────────────────────────────────────
  // تشغيل الأمر
  // ───────────────────────────────────────────

  onStart: async function ({
    api,
    event,
    args,
    message
  }) {

    const tid =
      String(event.threadID);

    // استعادة الأقفال
    restoreAll(api);

    const first =
      String(args[0] || "")
        .toLowerCase();

    // ─────────────────────────────────────────
    // OFF
    // ─────────────────────────────────────────

    if (
      first === "off" ||
      first === "فك" ||
      first === "unm" ||
      first === "stop"
    ) {

      stopTimer(tid);

      if (global._nmLocks[tid]) {
        global._nmLocks[tid].active =
          false;
      }

      const data = load();

      if (data[tid]) {
        data[tid].active = false;
        save(data);
      }

      return message.reply(
        "✅ تم فك قفل اسم الغروب."
      );
    }

    // ─────────────────────────────────────────
    // الاسم + التوقيت
    // ─────────────────────────────────────────

    if (args.length < 2) {

      return message.reply(
        "❌ الاستخدام الصحيح:\n\n" +
        "/nm شيطان كارا 30\n\n" +
        "📝 شيطان كارا = اسم الغروب\n" +
        "⏱️ 30 = عدد الثواني\n\n" +
        "مثال آخر:\n" +
        "/nm 𝐅𝐚𝐥𝐜𝐨𝐧 𝐆𝐑𝐎𝐔𝐏 10\n\n" +
        "لإيقاف القفل:\n" +
        "/nm off"
      );
    }

    // آخر قيمة هي التوقيت
    const delay =
      parseInt(
        args[args.length - 1],
        10
      );

    if (
      !Number.isInteger(delay) ||
      delay < 1
    ) {

      return message.reply(
        "❌ التوقيت يجب أن يكون رقماً أكبر من 0.\n\n" +
        "مثال:\n" +
        "/nm شيطان كارا 30"
      );
    }

    // الاسم = كل شيء قبل التوقيت
    const name =
      args
        .slice(0, -1)
        .join(" ")
        .trim();

    if (!name) {

      return message.reply(
        "❌ اكتب اسم الغروب.\n\n" +
        "مثال:\n" +
        "/nm شيطان كارا 30"
      );
    }

    // ─────────────────────────────────────────
    // إيقاف المؤقت القديم
    // ─────────────────────────────────────────

    stopTimer(tid);

    // ─────────────────────────────────────────
    // إنشاء القفل
    // ─────────────────────────────────────────

    global._nmLocks[tid] = {

      active: true,

      name: name,

      delay: delay

    };

    // ─────────────────────────────────────────
    // حفظ البيانات
    // ─────────────────────────────────────────

    const data = load();

    data[tid] =
      global._nmLocks[tid];

    save(data);

    // ─────────────────────────────────────────
    // تطبيق الاسم فوراً
    // ─────────────────────────────────────────

    try {

      await api.setTitle(
        name,
        tid
      );

    } catch (error) {

      return message.reply(
        "❌ فشل تغيير اسم الغروب.\n\n" +
        error.message
      );
    }

    // ─────────────────────────────────────────
    // تشغيل التوقيت
    // ─────────────────────────────────────────

    startTimer(
      api,
      tid
    );

    // ─────────────────────────────────────────
    // صامت عند نجاح التفعيل
    // ─────────────────────────────────────────

    return;
  },

  // ───────────────────────────────────────────
  // مراقبة تغيير اسم الغروب
  // ───────────────────────────────────────────

  onEvent: async function ({
    api,
    event
  }) {

    if (
      event.logMessageType !==
      "log:thread-name"
    ) {
      return;
    }

    const tid =
      String(event.threadID);

    const lock =
      global._nmLocks[tid];

    if (
      !lock ||
      !lock.active ||
      !lock.name
    ) {
      return;
    }

    const newName =
      event.logMessageData?.name || "";

    // الاسم بالفعل صحيح
    if (
      String(newName) ===
      String(lock.name)
    ) {
      return;
    }

    // منع التكرار
    if (
      global._nmRestoring[tid]
    ) {
      return;
    }

    global._nmRestoring[tid] = true;

    try {

      await api.setTitle(
        lock.name,
        tid
      );

    } catch (_) {

    } finally {

      delete global._nmRestoring[tid];

    }
  }
};
