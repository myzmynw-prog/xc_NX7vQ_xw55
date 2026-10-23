"use strict";

module.exports = {
  config: {
    name: "unsend",
    aliases: ["حذف", "del"],
    version: "1.2",
    author: "DJAMEL",
    countDown: 3,
    role: 2,
    category: "utility",
    description: "حذف آخر رسالة للبوت أو الرسالة المُرد عليها",
    guide: { en: "{pn} — رد على رسالة البوت لحذفها" }
  },

  onStart: async function ({ api, event, message }) {
    const botID = String(global.GoatBot?.botID || api.getCurrentUserID?.() || "");
    const threadID = event.threadID;

    let targetID = null;

    // 1. إذا تم الرد على رسالة
    if (event.messageReply) {
      const targetSender = String(event.messageReply.senderID || "");
      if (targetSender !== botID) {
        return message.reply("⛔ يمكنني حذف رسائل البوت فقط.");
      }
      targetID = event.messageReply.messageID;
    } 
    // 2. بدون رد - استخدام آخر رسالة مسجلة
    else {
      if (!global._lastBotMsg) global._lastBotMsg = {};
      targetID = global._lastBotMsg[String(threadID)];

      if (!targetID) {
        return message.reply("❌ لا توجد رسالة سابقة مسجلة للحذف.\nالرجاء الرد على رسالة البوت مباشرة.");
      }
    }

    // محاولة الحذف بعدة طرق مختلفة لتتوافق مع إصدار مكتبتك
    try {
      // الطريقة الأولى: استخدام دالة الـ message المدمجة في GoatBot (إن وجدت وهي الأضمن)
      if (message && typeof message.unsendMessage === "function") {
        await message.unsendMessage(targetID);
      } 
      // الطريقة الثانية: تمرير المعرف بشكل مباشر لـ api
      else if (typeof api.unsendMessage === "function") {
        try {
          await api.unsendMessage(targetID);
        } catch (err) {
          // إذا طلبت المكتبة كائن أو وسيط ثانٍ
          if (err.message && err.message.includes("required")) {
            await api.unsendMessage(targetID, threadID);
          } else {
            throw err;
          }
        }
      }

      // مسح الذاكرة المؤقتة لآخر رسالة إن وجدت
      if (global._lastBotMsg && global._lastBotMsg[String(threadID)]) {
        delete global._lastBotMsg[String(threadID)];
      }

      // حذف رسالة الأمر نفسها بعد ثانية
      setTimeout(() => {
        try {
          if (message && typeof message.unsendMessage === "function") {
            message.unsendMessage(event.messageID);
          } else {
            api.unsendMessage(event.messageID);
          }
        } catch (_) {}
      }, 1000);

    } catch (e) {
      return message.reply("❌ فشل الحذف: " + (e.message || JSON.stringify(e)));
    }
  }
};
