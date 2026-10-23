/**
 * 𝒁𝑨𝑴𝑨𝑺𝑼 V7 — /nick
 * قفل كنيات الأعضاء
 *
 * الأوامر:
 * /nick [اسم]              قفل كنية عامة
 * /nick set [uid] [اسم]    قفل كنية لشخص
 * /nick off                إيقاف القفل
 * /nick status             الحالة
 * /nick حذف                حذف القفل والكنيات
 */

"use strict";

const fs = require("fs-extra");
const path = require("path");

const DATA = path.join(
  process.cwd(),
  "database/data/nickLocks.json"
);

// ─────────────────────────────────────────────
// الأدوات
// ─────────────────────────────────────────────

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function load() {
  try {
    if (!fs.existsSync(DATA))
      return {};

    const raw = fs.readFileSync(DATA, "utf8");

    if (!raw.trim())
      return {};

    return JSON.parse(raw);
  } catch (err) {
    console.error("[NICK] فشل قراءة قاعدة البيانات:", err);
    return {};
  }
}

function save(data) {
  try {
    fs.ensureDirSync(path.dirname(DATA));

    fs.writeFileSync(
      DATA,
      JSON.stringify(data, null, 2),
      "utf8"
    );

    return true;
  } catch (err) {
    console.error("[NICK] فشل حفظ قاعدة البيانات:", err);
    return false;
  }
}

// ─────────────────────────────────────────────
// حالة البوت
// ─────────────────────────────────────────────

if (!global._nickLocks)
  global._nickLocks = {};

if (!global._nickRestoring)
  global._nickRestoring = {};

if (!global._nickRunning)
  global._nickRunning = {};

if (!global._nickRestored)
  global._nickRestored = false;

// ─────────────────────────────────────────────
// صلاحيات البوت
// ─────────────────────────────────────────────

function isBotAdmin(id) {

  const cfg =
    global.GoatBot?.config || {};

  const sid =
    String(id || "");

  const admins = [
    cfg.ownerID,
    ...(cfg.superAdminBot || []),
    ...(cfg.adminBot || [])
  ];

  return admins
    .filter(Boolean)
    .map(String)
    .includes(sid);
}

// ─────────────────────────────────────────────
// استعادة القفل بعد تشغيل البوت
// ─────────────────────────────────────────────

function restoreAll() {

  if (global._nickRestored)
    return;

  global._nickRestored = true;

  const data = load();

  for (
    const [threadID, lock]
    of Object.entries(data)
  ) {

    if (
      lock &&
      lock.active
    ) {

      global._nickLocks[
        String(threadID)
      ] = {

        active: true,

        globalName:
          String(lock.globalName || ""),

        perUser:
          lock.perUser || {}

      };
    }
  }

  console.log(
    `[NICK] تم استعادة ${Object.keys(global._nickLocks).length} قفل.`
  );
}

restoreAll();

// ─────────────────────────────────────────────
// الحصول على معلومات المجموعة
// ─────────────────────────────────────────────

async function getThreadInfo(api, threadID) {

  return new Promise(
    (resolve, reject) => {

      api.getThreadInfo(
        threadID,

        (error, data) => {

          if (error)
            return reject(error);

          resolve(data);
        }
      );

    }
  );
}

// ─────────────────────────────────────────────
// تغيير الكنية
// ─────────────────────────────────────────────

async function changeNick(
  api,
  threadID,
  userID,
  nickname
) {

  const key =
    `${threadID}:${userID}`;

  if (
    global._nickRestoring[key]
  ) {
    return false;
  }

  global._nickRestoring[key] = true;

  try {

    await api.changeNickname(
      nickname || "",
      threadID,
      userID
    );

    return true;

  } catch (error) {

    console.error(
      `[NICK] فشل تغيير كنية ${userID} في ${threadID}:`,
      error?.message || error
    );

    return false;

  } finally {

    delete global._nickRestoring[key];

  }
}

// ─────────────────────────────────────────────
// تحديد الكنية المطلوبة
// ─────────────────────────────────────────────

function getLockedName(
  lock,
  userID
) {

  if (!lock)
    return "";

  const uid =
    String(userID);

  if (
    lock.perUser &&
    Object.prototype.hasOwnProperty.call(
      lock.perUser,
      uid
    )
  ) {

    return String(
      lock.perUser[uid] || ""
    );
  }

  return String(
    lock.globalName || ""
  );
}

// ─────────────────────────────────────────────
// تطبيق القفل على أعضاء المجموعة
// ─────────────────────────────────────────────

async function enforceNicknames(
  api,
  threadID
) {

  const lock =
    global._nickLocks[threadID];

  if (!lock?.active)
    return;

  let info;

  try {

    info =
      await getThreadInfo(
        api,
        threadID
      );

  } catch (error) {

    console.error(
      `[NICK] فشل جلب أعضاء المجموعة ${threadID}:`,
      error?.message || error
    );

    return;
  }

  const botID =
    String(
      global.GoatBot?.botID || ""
    );

  const members =
    Array.isArray(info?.participantIDs)
      ? info.participantIDs
      : [];

  for (const rawUID of members) {

    const uid =
      String(rawUID);

    if (
      !uid ||
      uid === botID
    ) {
      continue;
    }

    if (
      !global._nickLocks[threadID]?.active
    ) {
      break;
    }

    const nickname =
      getLockedName(
        lock,
        uid
      );

    if (!nickname)
      continue;

    await changeNick(
      api,
      threadID,
      uid,
      nickname
    );

    // تأخير بسيط حتى لا يتم إرسال عشرات الطلبات دفعة واحدة
    await sleep(1200);
  }
}

// ─────────────────────────────────────────────
// حلقة المراقبة
// ─────────────────────────────────────────────

async function startMonitor(
  api,
  threadID
) {

  if (
    global._nickRunning[threadID]
  ) {
    return;
  }

  global._nickRunning[threadID] = true;

  try {

    while (
      global._nickLocks[threadID]?.active
    ) {

      await enforceNicknames(
        api,
        threadID
      );

      // إعادة الفحص كل 10 ثوانٍ
      await sleep(10000);
    }

  } catch (error) {

    console.error(
      `[NICK] خطأ في مراقبة ${threadID}:`,
      error?.message || error
    );

  } finally {

    global._nickRunning[threadID] = false;

  }
}

// ─────────────────────────────────────────────
// تشغيل المراقبة لكل الأقفال بعد بدء البوت
// ─────────────────────────────────────────────

function restoreMonitors(api) {

  for (
    const threadID
    of Object.keys(global._nickLocks)
  ) {

    if (
      global._nickLocks[threadID]?.active
    ) {

      startMonitor(
        api,
        threadID
      ).catch(error => {

        console.error(
          "[NICK] Monitor error:",
          error?.message || error
        );

      });

    }
  }
}

// ─────────────────────────────────────────────
// MODULE
// ─────────────────────────────────────────────

module.exports = {

  config: {

    name: "nick",

    aliases: [
      "nickname",
      "كنيات"
    ],

    version: "7.0",

    author: "𝒁𝑨𝑴𝑨𝑺𝑼",

    countDown: 3,

    role: 2,

    category: "management",

    description:
      "قفل كنيات أعضاء المجموعة ومنع تغييرها",

    guide: {

      en:
        "{pn} [name] — Lock nickname for everyone\n" +
        "{pn} set [uid] [name] — Lock nickname for user\n" +
        "{pn} off — Disable lock\n" +
        "{pn} status — Show status\n" +
        "{pn} delete — Remove lock"

    }

  },

  // ═══════════════════════════════════════════
  // تشغيل الأمر
  // ═══════════════════════════════════════════

  onStart: async function ({
    api,
    event,
    args,
    message
  }) {

    const threadID =
      String(event.threadID);

    const sub =
      String(args[0] || "")
        .toLowerCase()
        .trim();

    // تشغيل الأقفال المحفوظة
    restoreMonitors(api);

    // ═════════════════════════════════════════
    // OFF
    // ═════════════════════════════════════════

    if (
      sub === "off" ||
      sub === "إيقاف" ||
      sub === "stop"
    ) {

      if (
        global._nickLocks[threadID]
      ) {

        global._nickLocks[
          threadID
        ].active = false;

      }

      const data =
        load();

      if (data[threadID]) {

        data[threadID].active =
          false;

        save(data);

      }

      return message.reply(
        "✅ تم إيقاف قفل الكنيات."
      );
    }

    // ═════════════════════════════════════════
    // STATUS
    // ═════════════════════════════════════════

    if (
      sub === "status" ||
      sub === "حالة"
    ) {

      const lock =
        global._nickLocks[threadID];

      if (!lock?.active) {

        return message.reply(
          "💤 قفل الكنيات غير نشط."
        );

      }

      const perCount =
        Object.keys(
          lock.perUser || {}
        ).length;

      const monitor =
        global._nickRunning[threadID]
          ? "🟢 تعمل"
          : "🔴 متوقفة";

      return message.reply(

        "🔒 قفل الكنيات نشط\n" +
        `📝 الاسم العام: ${lock.globalName || "—"}\n` +
        `👤 كنيات فردية: ${perCount}\n` +
        `🔄 المراقبة: ${monitor}\n` +
        "⏱ الفحص الدوري: 10 ثوانٍ"

      );
    }

    // ═════════════════════════════════════════
    // DELETE / RESET
    // ═════════════════════════════════════════

    if (
      sub === "حذف" ||
      sub === "حدف" ||
      sub === "delete" ||
      sub === "reset"
    ) {

      if (
        global._nickLocks[threadID]
      ) {

        global._nickLocks[
          threadID
        ].active = false;

      }

      let info;

      try {

        info =
          await getThreadInfo(
            api,
            threadID
          );

      } catch (error) {

        return message.reply(
          "❌ تعذر الحصول على أعضاء المجموعة:\n" +
          (error?.message || error)
        );

      }

      const botID =
        String(
          global.GoatBot?.botID || ""
        );

      const members =
        Array.isArray(info?.participantIDs)
          ? info.participantIDs
          : [];

      for (const rawUID of members) {

        const uid =
          String(rawUID);

        if (
          !uid ||
          uid === botID
        ) {
          continue;
        }

        try {

          await api.changeNickname(
            "",
            threadID,
            uid
          );

        } catch (error) {

          console.error(
            `[NICK] فشل حذف كنية ${uid}:`,
            error?.message || error
          );

        }

        await sleep(1200);
      }

      delete global._nickLocks[
        threadID
      ];

      const data =
        load();

      delete data[threadID];

      save(data);

      return message.reply(
        "✅ تم حذف قفل الكنيات والكنيات."
      );
    }

    // ═════════════════════════════════════════
    // SET USER
    // ═════════════════════════════════════════

    if (sub === "set") {

      const uid =
        String(args[1] || "").trim();

      const nickname =
        args
          .slice(2)
          .join(" ")
          .trim();

      if (
        !uid ||
        !nickname
      ) {

        return message.reply(
          "❌ الاستخدام الصحيح:\n" +
          "/nick set [uid] [الاسم]"
        );

      }

      if (
        !global._nickLocks[threadID]
      ) {

        global._nickLocks[
          threadID
        ] = {

          active: true,

          globalName: "",

          perUser: {}

        };

      }

      const lock =
        global._nickLocks[
          threadID
        ];

      lock.active = true;

      if (!lock.perUser)
        lock.perUser = {};

      lock.perUser[uid] =
        nickname;

      const data =
        load();

      data[threadID] = {
        active: true,
        globalName:
          lock.globalName || "",
        perUser:
          lock.perUser || {}
      };

      save(data);

      // تطبيق فوري على الشخص
      await changeNick(
        api,
        threadID,
        uid,
        nickname
      );

      // تشغيل المراقبة
      startMonitor(
        api,
        threadID
      ).catch(error => {

        console.error(
          "[NICK] Monitor error:",
          error?.message || error
        );

      });

      return message.reply(
        `✅ تم قفل كنية ${uid} على "${nickname}"`
      );
    }

    // ═════════════════════════════════════════
    // GLOBAL NICKNAME
    // ═════════════════════════════════════════

    const nickname =
      args
        .join(" ")
        .trim();

    if (!nickname) {

      return message.reply(

        "❌ اكتب الاسم.\n\n" +

        "مثال:\n" +
        "/nick 𝑭𝒂𝒍𝒄𝒐𝒏\n\n" +

        "الأوامر:\n" +
        "/nick [اسم] — قفل للكل\n" +
        "/nick set [uid] [اسم] — قفل لشخص\n" +
        "/nick off — إيقاف\n" +
        "/nick status — الحالة\n" +
        "/nick حذف — حذف"

      );
    }

    const old =
      global._nickLocks[
        threadID
      ];

    global._nickLocks[
      threadID
    ] = {

      active: true,

      globalName:
        nickname,

      perUser:
        old?.perUser || {}

    };

    const data =
      load();

    data[threadID] = {
      active: true,
      globalName: nickname,
      perUser:
        global._nickLocks[
          threadID
        ].perUser || {}
    };

    save(data);

    // تطبيق القفل فوراً
    await enforceNicknames(
      api,
      threadID
    );

    // تشغيل المراقبة
    startMonitor(
      api,
      threadID
    ).catch(error => {

      console.error(
        "[NICK] Monitor error:",
        error?.message || error
      );

    });

    // بدون رسالة نجاح
    return;
  },

  // ═══════════════════════════════════════════
  // مراقبة أحداث تغيير الكنية
  // ═══════════════════════════════════════════

  onEvent: async function ({
    api,
    event
  }) {

    const threadID =
      String(event.threadID || "");

    if (!threadID)
      return;

    const lock =
      global._nickLocks[
        threadID
      ];

    if (!lock?.active)
      return;

    // ─────────────────────────────────────────
    // التعرف على حدث تغيير الكنية
    // ─────────────────────────────────────────

    const isNickChange =
      event.logMessageType ===
        "log:user-nickname" ||

      event.type ===
        "log:user-nickname" ||

      (
        event.logMessageData &&
        (
          event.logMessageData.participant_id !==
            undefined ||

          event.logMessageData.userId !==
            undefined ||

          event.logMessageData.subjectFbId !==
            undefined
        )
      );

    if (!isNickChange)
      return;

    // ─────────────────────────────────────────
    // الشخص الذي غُيرت كنيته
    // ─────────────────────────────────────────

    const data =
      event.logMessageData || {};

    const targetID =
      String(
        data.participant_id ||
        data.userId ||
        data.subjectFbId ||
        data.participantID ||
        ""
      );

    if (!targetID)
      return;

    // لا نعيد كنية البوت
    if (
      String(
        global.GoatBot?.botID || ""
      ) === targetID
    ) {
      return;
    }

    // ─────────────────────────────────────────
    // الشخص الذي قام بالتغيير
    // ─────────────────────────────────────────

    const changerID =
      String(
        event.author ||
        event.senderID ||
        event.userID ||
        ""
      );

    /*
     * إذا كان التغيير من أحد مشرفي البوت
     * نسمح له.
     */
    if (
      changerID &&
      isBotAdmin(changerID)
    ) {
      return;
    }

    // ─────────────────────────────────────────
    // الكنية المطلوبة
    // ─────────────────────────────────────────

    const nickname =
      getLockedName(
        lock,
        targetID
      );

    if (!nickname)
      return;

    // منع تكرار الطلب
    const key =
      `${threadID}:${targetID}`;

    if (
      global._nickRestoring[key]
    ) {
      return;
    }

    // انتظار قصير حتى ينتهي حدث Facebook
    await sleep(800);

    if (
      !global._nickLocks[
        threadID
      ]?.active
    ) {
      return;
    }

    await changeNick(
      api,
      threadID,
      targetID,
      nickname
    );

    // التأكد من أن المراقبة ما زالت تعمل
    if (
      global._nickLocks[
        threadID
      ]?.active &&
      !global._nickRunning[
        threadID
      ]
    ) {

      startMonitor(
        api,
        threadID
      ).catch(error => {

        console.error(
          "[NICK] Monitor restart error:",
          error?.message || error
        );

      });

    }
  }

};
