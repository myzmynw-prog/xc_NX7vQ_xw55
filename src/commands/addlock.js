/**
 * Alox V1 — /addlock — قفل عدد المجموعة
 * 
 * عند مغادرة أي شخص للمجموعة، يُضاف أحد حسابات المالك تلقائياً
 * لإبقاء عدد الأعضاء ثابتاً.
 *
 * الاستخدام:
 *  /addlock [groupId] [link1] [link2] ...  — ضبط روابط لمجموعة
 *  /addlock on                              — تفعيل للمجموعة الحالية
 *  /addlock off                             — إيقاف للمجموعة الحالية
 *  /addlock status                          — عرض الحالة
 *  /addlock list                            — عرض كل المجموعات المضبوطة
 *  /addlock clear                           — مسح روابط المجموعة الحالية
 */
"use strict";
const fs   = require("fs-extra");
const path = require("path");
const axios = require("axios");

const DATA_FILE = path.join(process.cwd(), "database", "data", "addLockConfig.json");
const MAX_GROUP_MEMBERS = 250;
const reconcileLocks = new Map();
fs.ensureDirSync(path.dirname(DATA_FILE));

// ── استخدم global لمنع فقدان الحالة عند hot-reload ─────────────────────────
if (!global._addLockConfig) {
  try {
    global._addLockConfig = fs.existsSync(DATA_FILE)
      ? JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))
      : {};
  } catch (_) { global._addLockConfig = {}; }
}

function loadConfig() { return global._addLockConfig; }
function saveConfig(cfg) {
  global._addLockConfig = cfg;
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(cfg, null, 2)); } catch (_) {}
}

// ── صلاحيات ──────────────────────────────────────────────────────────────────
function isBotAdmin(id) {
  const cfg = global.GoatBot?.config || {};
  const sid = String(id);
  return [cfg.ownerID, ...(cfg.superAdminBot || []), ...(cfg.adminBot || [])]
    .filter(Boolean).map(String).includes(sid);
}

// ── استخراج UID من رابط فيسبوك ──────────────────────────────────────────────
function extractUID(raw) {
  const s = String(raw || "").trim();
  // رقم مباشر
  if (/^\d{8,20}$/.test(s)) return s;
  // profile.php?id=123
  const m1 = s.match(/profile\.php\?[^"]*id=(\d+)/);
  if (m1) return m1[1];
  // /100xxx (id في المسار)
  const m2 = s.match(/facebook\.com\/(\d{8,20})\/?/);
  if (m2) return m2[1];
  return null; // اسم مستخدم — سنتعامل معه لاحقاً
}

// ── محاولة حل username إلى UID عبر HTTP ─────────────────────────────────────
async function resolveUsername(raw) {
  const uid = extractUID(raw);
  if (uid) return uid;
  // استخراج username
  const m = String(raw).match(/facebook\.com\/([^/?#]+)/);
  if (!m) return null;
  const username = m[1].replace(/^@/, "");
  if (["profile.php", "groups", "pages", "events"].includes(username)) return null;
  try {
    const r = await axios.get(`https://www.facebook.com/${username}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
      timeout: 10000, maxRedirects: 3,
    });
    const m2 = r.data.match(/"userID":"(\d+)"|"USER_ID":"(\d+)"|entity_id["\s:]+(\d{8,})/);
    if (m2) return m2[1] || m2[2] || m2[3];
  } catch (_) {}
  return null;
}

// ── إضافة مستخدم للمجموعة ────────────────────────────────────────────────────
async function addUserToGroup(api, uid, tid) {
  return new Promise((resolve, reject) => {
    api.addUserToGroup(uid, tid, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function uniqueIDs(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(v => {
    if (v && typeof v === "object") return v.id || v.userID || v.fbId || v.uid || "";
    return v;
  }).map(v => String(v || "").trim()).filter(Boolean))];
}

function getParticipantIDs(info) {
  return uniqueIDs(info?.participantIDs || info?.participants || []);
}

function getThreadInfo(api, tid) {
  return new Promise((resolve, reject) => {
    if (typeof api?.getThreadInfo !== "function") {
      return reject(new Error("getThreadInfo غير مدعوم"));
    }
    api.getThreadInfo(String(tid), (err, info) => err ? reject(err) : resolve(info || {}));
  });
}

function isAlreadyInGroupError(error) {
  return /already|عضو|member|participant|exists|موجود/i.test(String(error?.message || error || ""));
}

function removeWaitingAccounts(cfg, tid, ids) {
  const data = cfg[tid];
  if (!data?.links?.length || !ids.size) return false;
  const before = data.links.length;
  data.links = uniqueIDs(data.links).filter(uid => !ids.has(String(uid)));
  return data.links.length !== before;
}

function saveConfigIfChanged(cfg, changed) {
  if (changed) saveConfig(cfg);
}

async function reconcileAddLock(api, tid) {
  const key = String(tid);
  if (reconcileLocks.has(key)) return reconcileLocks.get(key);

  const job = (async () => {
    const cfg = loadConfig();
    const data = cfg[key];
    if (!data?.enabled || !data?.links?.length) return;

    let members;
    try {
      members = new Set(getParticipantIDs(await getThreadInfo(api, key)));
    } catch (error) {
      global.log?.warn?.("ADDLOCK", `تعذر قراءة أعضاء الغروب ${key}: ${error.message}`);
      return;
    }

    // احذف كل من دخل مسبقاً ثم املأ المقاعد الشاغرة حتى 250 أو نفاد القائمة.
    while (data.links.length && members.size < MAX_GROUP_MEMBERS) {
      const changed = removeWaitingAccounts(cfg, key, members);
      saveConfigIfChanged(cfg, changed);
      if (!data.links.length) break;

      // إعادة الفحص قبل كل إضافة لتجنب تجاوز الحد عند تزامن أحداث متعددة.
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        members = new Set(getParticipantIDs(await getThreadInfo(api, key)));
      } catch (error) {
        global.log?.warn?.("ADDLOCK", `تعذر تحديث أعضاء الغروب ${key}: ${error.message}`);
        break;
      }
      const freshChanged = removeWaitingAccounts(cfg, key, members);
      saveConfigIfChanged(cfg, freshChanged);
      if (!data.links.length || members.size >= MAX_GROUP_MEMBERS) break;

      let candidate = String(data.links[0] || "");
      if (!candidate) break;
      if (!/^\d{8,20}$/.test(candidate)) {
        const resolved = await resolveUsername(candidate);
        if (!resolved) {
          global.log?.warn?.("ADDLOCK", `تعذر تحويل الحساب المنتظر إلى UID: ${candidate}`);
          break;
        }
        candidate = resolved;
        data.links[0] = candidate;
        saveConfig(cfg);
      }
      try {
        await addUserToGroup(api, candidate, key);
        const current = loadConfig();
        if (current[key]) {
          current[key].links = uniqueIDs(current[key].links).filter(id => id !== candidate);
          current[key].index = 0;
          saveConfig(current);
        }
        members.add(candidate);
        global.log?.info?.("ADDLOCK", `✅ أُضيف UID ${candidate} إلى الغروب ${key}`);
      } catch (error) {
        if (isAlreadyInGroupError(error)) {
          const current = loadConfig();
          if (current[key]) {
            current[key].links = uniqueIDs(current[key].links).filter(id => id !== candidate);
            saveConfig(current);
          }
          members.add(candidate);
        } else {
          global.log?.warn?.("ADDLOCK", `فشل إضافة UID ${candidate}: ${error.message}`);
          break;
        }
      }
    }
    if (members.size >= MAX_GROUP_MEMBERS) {
      global.log?.info?.("ADDLOCK", `الغروب ${key} ممتلئ (${members.size}/${MAX_GROUP_MEMBERS})`);
    }
  })().finally(() => reconcileLocks.delete(key));

  reconcileLocks.set(key, job);
  return job;
}

// ── معالج حدث مغادرة/دخول الغروب ─────────────────────────────────────────────
function isLeaveEvent(event) {
  const t = event.logMessageType || event.type || "";
  return (
    t === "log:unsubscribe" ||
    t === "log:thread-remove-members" ||
    (t === "event" && (
      event.logMessageType === "log:unsubscribe" ||
      event.logMessageType === "log:thread-remove-members"
    ))
  );
}

function isJoinEvent(event) {
  const t = event.logMessageType || event.type || "";
  return t === "log:subscribe" ||
    (t === "event" && event.logMessageType === "log:subscribe");
}

function getAddedUIDs(event) {
  const d = event.logMessageData || event.eventData || {};
  return new Set(uniqueIDs(
    d.addedParticipants ||
    d.added_participants ||
    d.participantsAdded ||
    d.participants_added ||
    d.participants
  ));
}

function getLeftUID(event) {
  const d = event.logMessageData || {};
  const value =
    d.leftParticipantFbId ||
    d.removedParticipantFbId ||
    (Array.isArray(d.removed_participants) ? d.removed_participants[0] : null) ||
    (Array.isArray(d.participants) ? d.participants[0] : null) ||
    "";
  return value && typeof value === "object"
    ? String(value.id || value.userID || value.fbId || value.uid || "").trim()
    : String(value).trim();
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  config: {
    name: "addlock",
    aliases: ["قفل-الأعضاء", "memberlock"],
    version: "1.0",
    author: "Alox",
    countDown: 5,
    role: 2,
    category: "management",
    description: "قفل عدد أعضاء المجموعة — يُضاف حساب تلقائياً عند مغادرة أي شخص",
    guide: {
      en:
        "{pn} [id] [link1] [link2] ... — ضبط روابط لمجموعة\n" +
        "{pn} on  — تفعيل للمجموعة الحالية\n" +
        "{pn} off — إيقاف للمجموعة الحالية\n" +
        "{pn} status — عرض الحالة\n" +
        "{pn} list   — كل المجموعات المضبوطة\n" +
        "{pn} clear  — مسح روابط المجموعة الحالية",
    },
  },

  onStart: async function ({ api, event, args, message }) {
    if (!isBotAdmin(event.senderID))
      return message.reply("⛔ هذا الأمر للمالك والأدمن فقط.");

    const tid = String(event.threadID);
    const cfg = loadConfig();
    const sub = (args[0] || "").toLowerCase();

    // ── /addlock on ───────────────────────────────────────────────────────
    if (sub === "on" || sub === "تفعيل") {
      if (!cfg[tid]?.links?.length)
        return message.reply(
          "⚠️ لا توجد روابط لهذه المجموعة بعد.\n" +
          `استخدم: /addlock ${tid} [رابط1] [رابط2]`
        );
      cfg[tid].enabled = true;
      saveConfig(cfg);
      // إذا كانت هناك سعة شاغرة، ابدأ الإضافة مباشرة بدون انتظار مغادرة جديدة.
      reconcileAddLock(api, tid).catch(() => {});
      return message.reply(
        "╔══════════════════════════════╗\n" +
        "║  ✅ تم تفعيل AddLock         ║\n" +
        "╠══════════════════════════════╣\n" +
        `║  الروابط: ${cfg[tid].links.length} حساب              ║\n` +
        "║  عند مغادرة أي عضو سيُضاف  ║\n" +
        "║  أحد حساباتك تلقائياً      ║\n" +
        "╚══════════════════════════════╝"
      );
    }

    // ── /addlock off ──────────────────────────────────────────────────────
    if (sub === "off" || sub === "إيقاف") {
      if (cfg[tid]) { cfg[tid].enabled = false; saveConfig(cfg); }
      return message.reply(
        "╔══════════════════════════════╗\n" +
        "║  🔓 تم إيقاف AddLock         ║\n" +
        "╚══════════════════════════════╝"
      );
    }

    // ── /addlock status ───────────────────────────────────────────────────
    if (sub === "status" || sub === "حالة") {
      const data  = cfg[tid];
      const state = data?.enabled ? "✅ مفعّل" : "⏹ موقوف";
      const count = data?.links?.length || 0;
      return message.reply(
        "╔══════════════════════════════╗\n" +
        "║  🔒 AddLock — الحالة         ║\n" +
        "╠══════════════════════════════╣\n" +
        `║  الحالة : ${state.padEnd(18)}║\n` +
        `║  الروابط: ${String(count).padEnd(18)}║\n` +
        (count
          ? data.links.map((l, i) => `║  ${i + 1}. ${String(l).slice(0, 26)}\n`).join("")
          : "║  لا توجد روابط مضبوطة      ║\n") +
        "╚══════════════════════════════╝"
      );
    }

    // ── /addlock clear ────────────────────────────────────────────────────
    if (sub === "clear" || sub === "مسح") {
      delete cfg[tid];
      saveConfig(cfg);
      return message.reply("✅ تم مسح إعدادات AddLock لهذه المجموعة.");
    }

    // ── /addlock list ─────────────────────────────────────────────────────
    if (sub === "list" || sub === "قائمة") {
      const entries = Object.entries(cfg);
      if (!entries.length)
        return message.reply("📋 لا توجد مجموعات مضبوطة في AddLock.");
      const lines = [
        "╔══════════════════════════════╗",
        "║  📋 AddLock — المجموعات      ║",
        "╠══════════════════════════════╣",
      ];
      for (const [id, data] of entries) {
        lines.push(`║  ${(data?.enabled ? "✅" : "⏹")} ID: ${id}`);
        lines.push(`║     روابط: ${data?.links?.length || 0}`);
      }
      lines.push("╚══════════════════════════════╝");
      return message.reply(lines.join("\n"));
    }

    // ── /addlock [groupId] [link1] [link2] ... ────────────────────────────
    // المعامل الأول إما ID المجموعة أو رابط أول
    let targetTid = tid;
    let linkArgs  = args.slice(1);

    // إذا بدأ المعامل الأول برقم طويل فهو groupId
    if (/^\d{10,20}$/.test(args[0] || "")) {
      targetTid = args[0];
      linkArgs  = args.slice(1);
    } else if (args[0]) {
      // كل المعاملات روابط للمجموعة الحالية
      linkArgs = args;
    }

    if (!linkArgs.length) {
      return message.reply(
        "╔══════════════════════════════════════╗\n" +
        "║  🔒 AddLock — تعليمات الاستخدام      ║\n" +
        "╠══════════════════════════════════════╣\n" +
        "║  ضبط روابط:                          ║\n" +
        "║  /addlock [id] [رابط1] [رابط2]       ║\n" +
        "║  أو في الغروب الحالي:               ║\n" +
        "║  /addlock [رابط1] [رابط2]            ║\n" +
        "╠══════════════════════════════════════╣\n" +
        "║  /addlock on     — تفعيل             ║\n" +
        "║  /addlock off    — إيقاف             ║\n" +
        "║  /addlock status — الحالة            ║\n" +
        "║  /addlock list   — كل المجموعات     ║\n" +
        "╚══════════════════════════════════════╝"
      );
    }

    message.react("⏳", event.messageID);

    // معالجة الروابط
    const resolvedLinks = [];
    const failedLinks   = [];

    for (const raw of linkArgs) {
      const uid = await resolveUsername(raw);
      if (uid) resolvedLinks.push({ raw, uid });
      else     failedLinks.push(raw);
    }

    if (!resolvedLinks.length) {
      message.react("❌", event.messageID);
      return message.reply(
        "❌ لم يتم حل أي رابط إلى UID.\n" +
        "تأكد من الروابط أو استخدم UID مباشرة (أرقام فقط)."
      );
    }

    if (!cfg[targetTid]) cfg[targetTid] = { enabled: false, links: [], index: 0 };
    cfg[targetTid].links = resolvedLinks.map(l => l.uid);
    cfg[targetTid].index = 0;
    saveConfig(cfg);
    if (cfg[targetTid].enabled) reconcileAddLock(api, targetTid).catch(() => {});

    message.react("✅", event.messageID);
    const lines = [
      "╔══════════════════════════════╗",
      "║  ✅ تم ضبط AddLock           ║",
      "╠══════════════════════════════╣",
      `║  المجموعة : ${targetTid.slice(0, 17)}`,
      `║  الحسابات : ${resolvedLinks.length}`,
    ];
    resolvedLinks.forEach((l, i) =>
      lines.push(`║  ${i + 1}. UID: ${l.uid.slice(0, 18)}`)
    );
    if (failedLinks.length)
      lines.push(`║  ⚠️ لم يُحل: ${failedLinks.length} رابط`);
    lines.push("╠══════════════════════════════╣");
    lines.push("║  استخدم /addlock on للتفعيل ║");
    lines.push("╚══════════════════════════════╝");
    return message.reply(lines.join("\n"));
  },

  // ── كشف مغادرة الأعضاء وإضافة حساب بديل ────────────────────────────────────
  onEvent: async function ({ api, event }) {
    const tid    = String(event.threadID);
    const cfg    = loadConfig();
    const data   = cfg[tid];
    if (!data?.enabled || !data?.links?.length) return;

    // إذا دخل حساب من قائمة الانتظار بأي طريقة، احذفه فوراً من القائمة.
    if (isJoinEvent(event)) {
      const added = getAddedUIDs(event);
      if (added.size && removeWaitingAccounts(cfg, tid, added)) saveConfig(cfg);
      return;
    }

    if (!isLeaveEvent(event)) return;

    const leftUID = getLeftUID(event);
    // خروج أي عضو، بما في ذلك خروج أدمن، يفتح مكاناً جديداً.
    if (leftUID) {
      global.log?.info?.("ADDLOCK", `رصد خروج UID ${leftUID} من الغروب ${tid}`);
    }
    await reconcileAddLock(api, tid);
  },
  reconcile: reconcileAddLock,
};
