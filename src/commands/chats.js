/**
 * DAVID V1 — /chats — إدارة المحادثات والغروبات
 * Copyright © 2025 DJAMEL
 *
 * The group-management flow is inspired by the local WHITE-V3 reference
 * script, but uses David's per-thread command-control store instead of
 * executing arbitrary commands remotely.
 */
"use strict";

const fs = require("fs-extra");
const path = require("path");

const DM_DATA = path.join(process.cwd(), "database/data/dmLock.json");
const ctrl = require("../utils/cmdControl");

// These are the management commands requested for cross-group control.
// More commands can be added here without changing the reply flow.
const MANAGED_COMMANDS = [
  { name: "angel", label: "Angel — الرسائل التلقائية" },
  { name: "nm",    label: "NM — قفل اسم الغروب" },
  { name: "nick",  label: "Nick — قفل كنيات الأعضاء" },
];
const MANAGED_COMMAND_NAMES = new Set(MANAGED_COMMANDS.map(command => command.name));

function isAdmin(id) {
  return (global.GoatBot?.config?.adminBot || [])
    .map(String)
    .includes(String(id));
}

function getDmLocked() {
  if (global.GoatBot.dmLocked !== undefined) return !!global.GoatBot.dmLocked;
  try {
    if (fs.existsSync(DM_DATA)) {
      const data = JSON.parse(fs.readFileSync(DM_DATA, "utf8"));
      global.GoatBot.dmLocked = !!data.locked;
      return global.GoatBot.dmLocked;
    }
  } catch (_) {}
  return false;
}

function setDmLocked(value) {
  global.GoatBot.dmLocked = !!value;
  try {
    fs.ensureDirSync(path.dirname(DM_DATA));
    fs.writeFileSync(DM_DATA, JSON.stringify({ locked: !!value }, null, 2));
  } catch (_) {}
}

function send(api, body, threadID, callback) {
  return new Promise(resolve => {
    let settled = false;
    const finish = (error, info) => {
      if (settled) return;
      settled = true;
      if (callback) callback(error, info);
      resolve(info);
    };

    try {
      const result = api.sendMessage(body, threadID, finish);
      if (result && typeof result.then === "function") {
        result.then(info => finish(null, info)).catch(error => finish(error));
      }
    } catch (error) {
      finish(error);
    }
  });
}

function getThreadList(api, limit, cursor, tags) {
  return new Promise(resolve => {
    let settled = false;
    const finish = (error, data) => {
      if (settled) return;
      settled = true;
      if (error) return resolve([]);
      resolve(Array.isArray(data) ? data : data?.data || []);
    };

    try {
      const result = api.getThreadList(limit, cursor, tags, finish);
      if (result && typeof result.then === "function") {
        result.then(data => finish(null, data)).catch(error => finish(error));
      } else if (Array.isArray(result)) {
        finish(null, result);
      }
    } catch (error) {
      finish(error);
    }
  });
}

async function getAllGroups(api) {
  const groups = [];
  let cursor = null;

  for (let page = 0; page < 5; page++) {
    const batch = await getThreadList(api, 50, cursor, ["INBOX"]);
    if (!batch.length) break;

    for (const thread of batch) {
      if (thread?.isGroup && thread.threadID) groups.push(thread);
    }

    if (batch.length < 50) break;
    const last = batch[batch.length - 1];
    cursor = last?.timestamp || null;
    if (!cursor) break;
  }

  const seen = new Set();
  return groups.filter(group => {
    const id = String(group.threadID);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function groupName(group) {
  return group.name || group.threadName || `غروب ${group.threadID}`;
}

function commandStatus(tid, command) {
  return ctrl.isEnabled(tid, command) ? "🟢 مفعل" : "⚫ معطل";
}

function registerReply(api, event, state, callback) {
  if (!state?.messageID || !global.GoatBot?.onReply) return;
  const key = `chats_${state.messageID}`;
  global.GoatBot.onReply.set(key, {
    messageID: state.messageID,
    author: String(event.senderID),
    ts: Date.now(),
    callback: async ({ api: replyApi, event: replyEvent, message }) => {
      if (String(replyEvent.senderID) !== String(event.senderID)) return;
      await callback({
        api: replyApi,
        event: replyEvent,
        message,
        state,
        input: String(replyEvent.body || "").trim(),
      });
    },
  });
}

async function sendReplyMenu(api, event, body, state, callback) {
  await send(api, body, event.threadID, (_error, info) => {
    if (info?.messageID) registerReply(api, event, { ...state, messageID: info.messageID }, callback);
  });
}

function buildGroupList(groups) {
  let body = `👥 الغروبات (${groups.length})\n━━━━━━━━━━━━━━━━\n`;
  groups.slice(0, 30).forEach((group, index) => {
    body += `${index + 1}. ${groupName(group)}\n   🆔 ${group.threadID}\n\n`;
  });
  body += "━━━━━━━━━━━━━━━━\n↩️ رد برقم الغروب لإدارة أوامره";
  return body;
}

function buildGroupActions(group) {
  const tid = String(group.threadID);
  let body = `👥 ${groupName(group)}\n🆔 ${tid}\n`;
  body += "━━━━━━━━━━━━━━━━\n";
  MANAGED_COMMANDS.forEach((command, index) => {
    body += `${index + 1}. /${command.name} — ${commandStatus(tid, command.name)}\n`;
  });
  body += "━━━━━━━━━━━━━━━━\n";
  body += "↩️ رد برقم الأمر لتبديل حالته\n";
  body += "0️⃣ العودة إلى قائمة الغروبات";
  return body;
}

function buildCommandPrompt(group) {
  return (
    `✅ تم اختيار الغروب: ${groupName(group)}\n` +
    `🆔 ${group.threadID}\n` +
    "━━━━━━━━━━━━━━━━\n" +
    "أرسل الآن الأمر الذي تريد تفعيله في هذا الغروب بالرد على هذه الرسالة:\n\n" +
    "• /angel hh 60 80\n" +
    "• /nm hhh 5 15\n" +
    "• /nick hhh\n\n" +
    "0️⃣ إلغاء"
  );
}

function parseManagedCommand(input) {
  const prefix = global.GoatBot?.config?.prefix || "/";
  const raw = String(input || "").trim();
  if (!raw.startsWith(prefix)) return null;

  const parts = raw.slice(prefix.length).trim().split(/\s+/).filter(Boolean);
  const name = String(parts.shift() || "").toLowerCase();
  if (!MANAGED_COMMAND_NAMES.has(name)) return null;

  const command = global.GoatBot?.commands?.get(name);
  if (!command?.onStart) return null;
  return { name, args: parts, command };
}

function buildRemoteMessage(api, targetEvent) {
  return {
    reply: (body, callback) => send(api, body, targetEvent.threadID, callback),
    unsend: (messageID, callback) => {
      try { return api.unsendMessage(messageID || targetEvent.messageID, callback); } catch (_) {}
    },
    react: (emoji, messageID, callback) => {
      try {
        return api.setMessageReaction(
          emoji,
          messageID || targetEvent.messageID,
          callback || (() => {}),
          true,
        );
      } catch (_) {}
    },
    send: (body, threadID, callback) => send(api, body, threadID || targetEvent.threadID, callback),
  };
}

async function executeRemoteCommand(api, sourceEvent, sourceMessage, group, input) {
  const parsed = parseManagedCommand(input);
  if (!parsed) {
    return sourceMessage.reply(
      "❌ أمر غير مدعوم.\n" +
      "الأوامر المتاحة:\n" +
      "/angel [رسالة] [min] [max]\n" +
      "/nm [اسم] [min] [max]\n" +
      "/nick [اسم]\n" +
      "أرسل 0 للإلغاء.",
    );
  }

  const targetThreadID = String(group.threadID);
  // Remote execution is itself the activation flow. Keep the selected command
  // enabled in the target thread so the normal event handler does not block it.
  ctrl.setCommandEnabled(targetThreadID, parsed.name, true);

  const targetEvent = {
    ...sourceEvent,
    type: "message",
    messageID: `chats_remote_${Date.now()}`,
    threadID: targetThreadID,
    isGroup: true,
    body: String(input).trim(),
  };

  try {
    await parsed.command.onStart({
      api,
      event: targetEvent,
      args: parsed.args,
      commandName: parsed.name,
      message: buildRemoteMessage(api, targetEvent),
      prefix: global.GoatBot?.config?.prefix || "/",
      role: 2,
      senderID: sourceEvent.senderID,
      threadID: targetThreadID,
    });

    return sourceMessage.reply(
      `✅ تم إرسال /${parsed.name} إلى غروب "${groupName(group)}".\n` +
      "يمكنك إرسال أمر آخر بالرد على رسالة الغروب نفسها.",
    );
  } catch (error) {
    global.log?.error?.("CHATS_REMOTE", `فشل تنفيذ /${parsed.name}: ${error.message}`);
    return sourceMessage.reply(
      `❌ تعذر تنفيذ /${parsed.name} في غروب "${groupName(group)}": ${error.message}`,
    );
  }
}

async function showGroupCommandPrompt(api, event, group) {
  return sendReplyMenu(
    api,
    event,
    buildCommandPrompt(group),
    { step: "COMMAND_INPUT", group },
    async ({ api: replyApi, event: replyEvent, message, state, input }) => {
      if (input === "0") return message.reply("✅ تم إلغاء التحكم بالغروب.");
      return executeRemoteCommand(replyApi, event, message, state.group, input);
    },
  );
}

async function showGroupActions(api, event, group) {
  return sendReplyMenu(
    api,
    event,
    buildGroupActions(group),
    { step: "GROUP_ACTION", group },
    async ({ api: actionApi, event: actionEvent, message: actionMessage, state: actionState, input: actionInput }) => {
      if (actionInput === "0") return showGroups(actionApi, actionEvent);

      const commandIndex = Number.parseInt(actionInput, 10) - 1;
      if (!Number.isInteger(commandIndex) || commandIndex < 0 || commandIndex >= MANAGED_COMMANDS.length) {
        return actionMessage.reply(`❌ رقم غير صحيح. اختر من 1 إلى ${MANAGED_COMMANDS.length} أو 0 للعودة.`);
      }

       const command = MANAGED_COMMANDS[commandIndex];
       const enabled = !ctrl.isEnabled(actionState.group.threadID, command.name);
       ctrl.setCommandEnabled(actionState.group.threadID, command.name, enabled);

       return showGroupActions(
         actionApi,
         actionEvent,
         actionState.group,
       ).then(() => actionMessage.reply(
         `✅ تم ${enabled ? "تفعيل" : "تعطيل"} /${command.name} في "${groupName(actionState.group)}"`
       ));
    }
  );
}

async function showGroups(api, event) {
  const groups = await getAllGroups(api);
  if (!groups.length) {
    return send(api, "📭 لم أجد غروبات يديرها البوت حالياً.", event.threadID);
  }

  return sendReplyMenu(api, event, buildGroupList(groups), { step: "GROUP_LIST", groups }, async ({
    api: replyApi,
    event: replyEvent,
    message,
    state,
    input,
  }) => {
    if (input === "0") return message.reply("✅ تم إلغاء إدارة الغروبات.");
    const index = Number.parseInt(input, 10) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= Math.min(state.groups.length, 30)) {
      return message.reply(`❌ رقم غير صحيح. اختر من 1 إلى ${Math.min(state.groups.length, 30)}.`);
    }

     const selected = state.groups[index];
     return showGroupCommandPrompt(replyApi, replyEvent, selected);
  });
}

module.exports = {
  config: {
    name: "chats",
    aliases: ["محادثات", "chat"],
    version: "3.0",
    author: "DJAMEL",
    countDown: 3,
    role: 2,
    category: "management",
     description: "إدارة المحادثات والغروبات وتشغيل أوامرها عن بعد",
    guide: {
       en: "{pn} — اختيار غروب ثم إرسال أمر Angel أو NM أو Nick إليه\n" +
          "{pn} list — قائمة الغروبات\n" +
          "{pn} dm on/off — قفل أو فتح الخاص\n" +
          "{pn} count — إحصائيات المحادثات",
    },
  },

  onStart: async function({ api, event, args, message }) {
    if (!isAdmin(event.senderID)) return message.reply("⛔ للأدمن فقط.");

    const sub = String(args[0] || "").toLowerCase();
    if (sub === "dm") {
      const action = String(args[1] || "").toLowerCase();
      if (action === "on") {
        setDmLocked(true);
        return message.reply("✅ تم تفعيل DM Lock — البوت لن يرد على الرسائل الخاصة.");
      }
      if (action === "off") {
        setDmLocked(false);
        return message.reply("✅ تم إلغاء DM Lock.");
      }
      return message.reply(`🔒 DM Lock: ${getDmLocked() ? "مفعل" : "معطل"}\nاستخدم: /chats dm on/off`);
    }

    if (sub === "count") {
      const threads = await getThreadList(api, 50, null, ["INBOX"]);
      const groups = threads.filter(thread => thread?.isGroup);
      const dms = threads.filter(thread => !thread?.isGroup);
      return message.reply(
        `📊 إحصائيات المحادثات\n━━━━━━━━━━━━━━━━\n` +
        `👥 غروبات: ${groups.length}\n` +
        `💬 محادثات خاصة: ${dms.length}\n` +
        `🔒 DM Lock: ${getDmLocked() ? "مفعل" : "معطل"}`
      );
    }

    if (sub === "list" || sub === "groups" || !sub) return showGroups(api, event);
    return message.reply("📌 الاستخدام:\n/chats — إدارة أوامر الغروبات\n/chats list\n/chats count\n/chats dm on/off");
  },

  // Kept for compatibility with command runners that call command-level replies.
  onReply: async function() {},
};
