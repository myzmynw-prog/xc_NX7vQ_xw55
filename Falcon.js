const { login } = require("@dongdev/fca-unofficial");
const fs = require("fs");
const path = require("path");

// سجل وقت بدء التشغيل المباشر
const botStartTime = Date.now();

// ─────────────────────────────────────────────
// تجهيزات Falcon / GoatBot
// ─────────────────────────────────────────────
if (!global.GoatBot) global.GoatBot = {};
if (!global._msgListeners) global._msgListeners = [];

// حالة قفل البوت
if (typeof global.FalconBotLocked !== "boolean") {
  global.FalconBotLocked = false;
}

// ─────────────────────────────────────────────
// 1. قراءة config.json
// ─────────────────────────────────────────────
let config = {};
const configPath = path.join(__dirname, "config.json");

if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (err) {
    console.error("❌ خطأ في قراءة ملف config.json:", err.message);
  }
} else {
  console.warn("⚠️ لم يتم العثور على ملف config.json");
}

// ─────────────────────────────────────────────
// 2. ذاكرة الأوامر + Rate Limit
// ─────────────────────────────────────────────
const activeFeatures = new Map();
const userMessageTracker = new Map();

const groupManager = {
  isEnabled: (threadID, featureName) => {
    if (!activeFeatures.has(threadID)) return false;
    return activeFeatures.get(threadID).has(featureName);
  },

  enable: (threadID, featureName) => {
    if (!activeFeatures.has(threadID)) {
      activeFeatures.set(threadID, new Set());
    }

    activeFeatures.get(threadID).add(featureName);
  },

  disable: (threadID, featureName) => {
    if (activeFeatures.has(threadID)) {
      activeFeatures.get(threadID).delete(featureName);
    }
  }
};

// ─────────────────────────────────────────────
// استخراج المالكين والأدمن
// ─────────────────────────────────────────────
function getAdminLists(cfg) {
  const superKeys = [
    "superAdminBot",
    "NDO_OWNER",
    "OWNER_IDS",
    "ownerID",
    "owner"
  ];

  const adminKeys = [
    "NDO_ADMIN",
    "ADMINBOT",
    "adminOnly",
    "ADMIN_IDS",
    "admin",
    "adminBot"
  ];

  const superSet = new Set();
  const adminSet = new Set();

  const extract = (keys, targetSet) => {
    for (const key of keys) {
      const val = cfg[key];

      if (Array.isArray(val)) {
        val.forEach(id => {
          targetSet.add(String(id));
        });
      } else if (
        typeof val === "string" ||
        typeof val === "number"
      ) {
        String(val)
          .split(/[\s,;]+/)
          .forEach(id => {
            if (id) targetSet.add(id);
          });
      }
    }
  };

  extract(superKeys, superSet);
  extract(adminKeys, adminSet);

  return {
    superSet,
    adminSet
  };
}

// ─────────────────────────────────────────────
// الصلاحيات
//
// 0 = عضو عادي
// 1 = أدمن مجموعة
// 2 = أدمن بوت
// 3 = مالك البوت
// ─────────────────────────────────────────────
function getUserPermission(senderID, threadInfo, config) {
  const { superSet, adminSet } = getAdminLists(config);
  const idStr = String(senderID);

  // المالك
  if (superSet.has(idStr)) {
    return 3;
  }

  // أدمن البوت
  if (adminSet.has(idStr)) {
    return 2;
  }

  // أدمن المجموعة
  if (threadInfo && Array.isArray(threadInfo.adminIDs)) {
    const isGroupAdmin = threadInfo.adminIDs.some(
      admin => String(admin.id) === idStr
    );

    if (isGroupAdmin) {
      return 1;
    }
  }

  // عضو عادي
  return 0;
}

// ─────────────────────────────────────────────
// Stealth Mode
// ─────────────────────────────────────────────
function isStealthActive(cfg) {
  if (!cfg.stealth || !cfg.stealth.enable) {
    return false;
  }

  const currentHour = new Date().getHours();

  const start = cfg.stealth.sleepHourStart ?? 1;
  const end = cfg.stealth.sleepHourEnd ?? 7;

  if (start < end) {
    return currentHour >= start && currentHour < end;
  }

  return currentHour >= start || currentHour < end;
}

// ─────────────────────────────────────────────
// Rate Limit
// ─────────────────────────────────────────────
function isRateLimited(senderID, cfg) {
  if (!cfg.rateLimit) {
    return false;
  }

  const max = cfg.rateLimit.maxMessagesPerWindow || 5;
  const windowMs = cfg.rateLimit.windowMs || 8000;
  const now = Date.now();

  if (!userMessageTracker.has(senderID)) {
    userMessageTracker.set(senderID, []);
  }

  const timestamps = userMessageTracker
    .get(senderID)
    .filter(ts => now - ts < windowMs);

  timestamps.push(now);

  userMessageTracker.set(senderID, timestamps);

  return timestamps.length > max;
}

// ─────────────────────────────────────────────
// 4. تنظيف الكوكيز
// ─────────────────────────────────────────────
function normalizeAppState(input) {
  let parsed = input;

  if (typeof input === "string") {
    const value = input.trim();

    try {
      parsed = JSON.parse(value);
    } catch (_) {
      parsed = value
        .split(";")
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => {
          const i = part.indexOf("=");

          if (i === -1) {
            return null;
          }

          return {
            key: part.slice(0, i).trim(),
            value: part.slice(i + 1).trim()
          };
        })
        .filter(Boolean);
    }
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed)
  ) {
    if (parsed.appState) {
      parsed = parsed.appState;
    } else if (parsed.cookies) {
      parsed = parsed.cookies;
    } else {
      parsed = Object.entries(parsed).map(
        ([key, value]) => ({
          key,
          value: String(value)
        })
      );
    }
  }

  if (Array.isArray(parsed)) {
    return parsed
      .map(cookie => {
        if (!cookie || typeof cookie !== "object") {
          return null;
        }

        const key =
          cookie.key ??
          cookie.name ??
          cookie.cookieName;

        const value =
          cookie.value ??
          cookie.val ??
          cookie.cookieValue;

        if (!key || value === undefined) {
          return null;
        }

        return {
          key: String(key),
          value: String(value),
          domain: cookie.domain || "facebook.com",
          path: cookie.path || "/"
        };
      })
      .filter(Boolean);
  }

  throw new Error("صيغة الكوكيز غير مدعومة.");
}

// ─────────────────────────────────────────────
// 5. قراءة account.txt
// ─────────────────────────────────────────────
const accountFilePath = path.join(
  __dirname,
  "account.txt"
);

let appStateData;

try {
  if (fs.existsSync(accountFilePath)) {
    const rawData = fs.readFileSync(
      accountFilePath,
      "utf8"
    );

    appStateData = normalizeAppState(rawData);
  } else {
    console.error(
      "❌ لم يتم العثور على ملف account.txt"
    );

    process.exit(1);
  }
} catch (err) {
  console.error(
    "❌ خطأ أثناء معالجة الكوكيز:",
    err.message
  );

  process.exit(1);
}

// ─────────────────────────────────────────────
// 6. تحميل الأوامر والأحداث
// ─────────────────────────────────────────────
const commands = new Map();
const aliases = new Map();
const eventHandlers = new Map();

const possibleCommandPaths = [
  path.join(__dirname, "src", "commands"),
  path.join(__dirname, "commands")
];

const commandsPath = possibleCommandPaths.find(
  p => fs.existsSync(p)
);

if (commandsPath) {
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter(file => file.endsWith(".js"));

  for (const file of commandFiles) {
    try {
      const command = require(
        path.join(commandsPath, file)
      );

      const cmdConfig = command.config || command;

      const cmdName =
        cmdConfig.name || command.name;

      if (cmdName) {
        const lowerName = cmdName.toLowerCase();

        commands.set(
          lowerName,
          command
        );

        if (
          cmdConfig.aliases &&
          Array.isArray(cmdConfig.aliases)
        ) {
          cmdConfig.aliases.forEach(alias => {
            aliases.set(
              alias.toLowerCase(),
              lowerName
            );
          });
        }
      }

      if (
        typeof command.handleEvent === "function" ||
        typeof command.onEvent === "function" ||
        typeof command.onChat === "function"
      ) {
        eventHandlers.set(
          file,
          command
        );
      }
    } catch (cmdErr) {
      console.warn(
        `⚠️ تم تجاوز الأمر [${file}]: ${cmdErr.message}`
      );
    }
  }

  console.log(
    `✅ تم تحميل ${commands.size} أمر و ${aliases.size} اختصار بنجاح.`
  );
} else {
  console.warn(
    "⚠️ لم يتم العثور على مجلد commands."
  );
}

// ─────────────────────────────────────────────
// GoatBot
// ─────────────────────────────────────────────
global.GoatBot = {
  ...global.GoatBot,

  startTime: botStartTime,

  commands,

  config: {
    ...config,
    prefix:
      config.prefix ||
      config.PREFIX ||
      "/"
  },

  botID: "—"
};

// ─────────────────────────────────────────────
// 7. تسجيل الدخول
// ─────────────────────────────────────────────
login(
  {
    appState: appStateData,
    autoLogin: false
  },

  (err, api) => {
    if (err) {
      console.error(
        "❌ فشل تسجيل الدخول:",
        err.message || err
      );

      return;
    }

    console.log(
      "🚀 تم تسجيل الدخول بنجاح!"
    );

    global.GoatBot.fcaApi = api;

    if (api.getCurrentUserID) {
      global.GoatBot.botID =
        api.getCurrentUserID();
    }

    api.setOptions({
      listenEvents: true,
      selfListen: false,
      logLevel: "silent",
      forceLogin: true,
      autoMarkDelivery: true,
      autoMarkRead: false,
      online: true,
      updatePresence: true,
      autoLogin: false
    });

    // الحفاظ على الظهور أونلاين
    setInterval(() => {
      try {
        api.setOptions({
          online: true,
          updatePresence: true
        });
      } catch (_) {}
    }, 30000);

    // ─────────────────────────────────────────
    // 8. الاستماع للرسائل
    // ─────────────────────────────────────────
    api.listenMqtt(
      async (listenErr, event) => {
        try {
          if (
            listenErr ||
            !event ||
            !event.threadID
          ) {
            return;
          }

          // Stealth Mode
          if (isStealthActive(config)) {
            return;
          }

          const threadID =
            String(event.threadID);

          const senderID =
            String(
              event.senderID ||
              event.author ||
              ""
            );

          // Rate Limit
          if (
            isRateLimited(
              senderID,
              config
            )
          ) {
            return;
          }

          // المستمعات العامة
          if (
            Array.isArray(
              global._msgListeners
            )
          ) {
            global._msgListeners.forEach(
              listener => {
                try {
                  listener({
                    threadID,
                    messageID:
                      event.messageID,
                    senderID,
                    event
                  });
                } catch (_) {}
              }
            );
          }

          // ───────────────────────────────────
          // حساب مدة تشغيل البوت
          // ───────────────────────────────────
          const getUptime = () => {
            const totalSeconds =
              Math.floor(
                (Date.now() -
                  botStartTime) /
                  1000
              );

            const hours =
              Math.floor(
                totalSeconds / 3600
              );

            const minutes =
              Math.floor(
                (totalSeconds % 3600) /
                  60
              );

            const seconds =
              totalSeconds % 60;

            return `${hours} ساعة و ${minutes} دقيقة و ${seconds} ثانية`;
          };

          // ───────────────────────────────────
          // إرسال رسالة مع الكتابة
          // ───────────────────────────────────
          const sendDelayedMessage = (
            msg,
            callback = null
          ) => {
            const str =
              typeof msg === "string"
                ? msg
                : msg?.body || "";

            const typingDuration =
              Math.min(
                Math.max(
                  str.length * 60,
                  3500
                ),
                7000
              );

            try {
              if (
                typeof api.sendTypingIndicator ===
                "function"
              ) {
                api.sendTypingIndicator(
                  threadID,
                  () => {}
                );
              }
            } catch (_) {}

            setTimeout(() => {
              try {
                api.sendMessage(
                  msg,
                  threadID,
                  callback
                );
              } catch (_) {}
            }, typingDuration);
          };

          // ───────────────────────────────────
          // message helper
          // ───────────────────────────────────
          const messageHelper = {
            reply: (msg, cb) =>
              sendDelayedMessage(
                msg,
                cb
              ),

            send: (msg, cb) =>
              sendDelayedMessage(
                msg,
                cb
              ),

            react: emoji =>
              api.setMessageReaction(
                emoji,
                event.messageID,
                () => {},
                true
              )
          };

          // ───────────────────────────────────
          // معلومات المجموعة
          // ───────────────────────────────────
          api.getThreadInfo(
            threadID,
            (threadErr, threadInfo) => {
              if (threadErr) {
                threadInfo = null;
              }

              // ───────────────────────────────
              // حساب صلاحية المستخدم
              // ───────────────────────────────
              const userPermission =
                getUserPermission(
                  senderID,
                  threadInfo,
                  config
                );

              // =================================================
              // 🔒 قفل البوت
              //
              // أثناء /lock:
              // 0 = عضو عادي       ❌
              // 1 = أدمن مجموعة    ❌
              // 2 = أدمن بوت       ✅
              // 3 = مالك البوت     ✅
              // =================================================
              if (
                global.FalconBotLocked === true &&
                userPermission < 2
              ) {
                return;
              }

              // =================================================
              // 🛑 تجاهل الأعضاء العاديين
              // =================================================
              if (
                userPermission === 0
              ) {
                return;
              }

              // ───────────────────────────────
              // Context
              // ───────────────────────────────
              const context = {
                api,
                event,

                message:
                  messageHelper,

                Users: api,
                Threads: api,

                startTime:
                  botStartTime,

                getUptime,

                isAdmin:
                  userPermission >= 1,

                isSuperAdmin:
                  userPermission === 3,

                isOwner:
                  userPermission === 3,

                userPermission,

                permssion:
                  userPermission,

                role:
                  userPermission,

                config,

                groupManager
              };

              // ───────────────────────────────
              // تشغيل مستمعات الأحداث
              // ───────────────────────────────
              eventHandlers.forEach(
                handler => {
                  try {
                    if (
                      typeof handler.handleEvent ===
                      "function"
                    ) {
                      handler.handleEvent(
                        context
                      );
                    }

                    if (
                      typeof handler.onEvent ===
                      "function"
                    ) {
                      handler.onEvent(
                        context
                      );
                    }

                    if (
                      typeof handler.onChat ===
                      "function"
                    ) {
                      handler.onChat(
                        context
                      );
                    }
                  } catch (_) {}
                }
              );

              // ───────────────────────────────
              // معالجة الرسائل
              // ───────────────────────────────
              if (
                (
                  event.type ===
                    "message" ||
                  event.type ===
                    "message_reply"
                ) &&
                event.body
              ) {
                const messageText =
                  event.body.trim();

                const prefix =
                  config.prefix ||
                  config.PREFIX ||
                  "/";

                // ─────────────────────────────
                // التحقق من Prefix
                // ─────────────────────────────
                let hasPrefix = false;

                let cleanInput =
                  messageText;

                if (
                  cleanInput.startsWith(
                    prefix
                  )
                ) {
                  cleanInput =
                    cleanInput.slice(
                      prefix.length
                    );

                  hasPrefix = true;
                } else if (
                  cleanInput.startsWith(
                    "!"
                  ) ||
                  cleanInput.startsWith(
                    "/"
                  )
                ) {
                  cleanInput =
                    cleanInput.slice(1);

                  hasPrefix = true;
                }

                // بدون Prefix = تجاهل
                if (!hasPrefix) {
                  return;
                }

                // ─────────────────────────────
                // تحليل الأمر
                // ─────────────────────────────
                const args =
                  cleanInput
                    .trim()
                    .split(/ +/);

                let inputCmd =
                  args
                    .shift()
                    .toLowerCase();

                // ─────────────────────────────
                // Alox / Falcon
                // ─────────────────────────────
                if (
                  inputCmd === "alox" ||
                  inputCmd === "falcon"
                ) {
                  const subCmd =
                    args[0]
                      ? args[0].toLowerCase()
                      : "";

                  if (
                    subCmd === "off" ||
                    subCmd === "إيقاف" ||
                    subCmd === "تعطيل"
                  ) {
                    groupManager.disable(
                      threadID,
                      "alox"
                    );
                  } else if (
                    subCmd === "on" ||
                    subCmd === "تشغيل" ||
                    subCmd === "تفعيل"
                  ) {
                    groupManager.enable(
                      threadID,
                      "alox"
                    );
                  }
                }

                // ─────────────────────────────
                // Aliases
                // ─────────────────────────────
                if (
                  aliases.has(inputCmd)
                ) {
                  inputCmd =
                    aliases.get(
                      inputCmd
                    );
                }

                // ─────────────────────────────
                // تنفيذ الأمر
                // ─────────────────────────────
                if (
                  commands.has(
                    inputCmd
                  )
                ) {
                  const cmd =
                    commands.get(
                      inputCmd
                    );

                  const cmdConfig =
                    cmd.config ||
                    cmd;

                  // ─────────────────────────
                  // الصلاحية المطلوبة
                  // ─────────────────────────
                  let requiredPermission = 0;

                  if (
                    cmdConfig.hasPermission !==
                    undefined
                  ) {
                    requiredPermission =
                      Number(
                        cmdConfig.hasPermission
                      );
                  } else if (
                    cmdConfig.permission !==
                    undefined
                  ) {
                    requiredPermission =
                      Number(
                        cmdConfig.permission
                      );
                  } else if (
                    cmdConfig.role !==
                    undefined
                  ) {
                    requiredPermission =
                      Number(
                        cmdConfig.role
                      );
                  }

                  // ─────────────────────────
                  // التحقق من الصلاحية
                  // ─────────────────────────
                  if (
                    userPermission <
                    requiredPermission
                  ) {
                    return;
                  }

                  context.args =
                    args;

                  try {
                    if (
                      typeof cmd.onStart ===
                      "function"
                    ) {
                      cmd.onStart(
                        context
                      );
                    } else if (
                      typeof cmd.execute ===
                      "function"
                    ) {
                      cmd.execute(
                        context
                      );
                    } else if (
                      typeof cmd.run ===
                      "function"
                    ) {
                      cmd.run(
                        context
                      );
                    } else if (
                      typeof cmd ===
                      "function"
                    ) {
                      cmd(
                        api,
                        event,
                        args
                      );
                    }
                  } catch (execErr) {
                    console.error(
                      `❌ خطأ عند تنفيذ الأمر ${inputCmd}:`,
                      execErr.message
                    );
                  }
                }
              }
            }
          );
        } catch (e) {
          console.error(
            "❌ خطأ معالجة الحدث:",
            e.message
          );
        }
      }
    );
  }
);

// ─────────────────────────────────────────────
// 9. مراقبة الكوكيز كل 6 دقائق
// ─────────────────────────────────────────────
(function setupCookieWatchdog() {
  const CHECK_INTERVAL =
    6 * 60 * 1000;

  setInterval(() => {
    try {
      const api =
        global.GoatBot?.fcaApi ||
        global.fcaApi ||
        global.api;

      if (
        !api ||
        typeof api.getAppState !==
          "function"
      ) {
        return;
      }

      const currentAppState =
        api.getAppState();

      if (
        !currentAppState ||
        !Array.isArray(
          currentAppState
        ) ||
        currentAppState.length === 0
      ) {
        return;
      }

      if (
        !fs.existsSync(
          accountFilePath
        )
      ) {
        return;
      }

      const rawData =
        fs.readFileSync(
          accountFilePath,
          "utf8"
        );

      let fileData;
      let hasChanged = false;

      try {
        fileData =
          JSON.parse(rawData);

        if (
          Array.isArray(fileData)
        ) {
          if (
            JSON.stringify(
              fileData
            ) !==
            JSON.stringify(
              currentAppState
            )
          ) {
            fileData =
              currentAppState;

            hasChanged = true;
          }
        } else if (
          typeof fileData ===
            "object" &&
          fileData !== null
        ) {
          const cookieKey =
            fileData.appState
              ? "appState"
              : fileData.cookies
              ? "cookies"
              : "appstate";

          const oldCookies =
            fileData[cookieKey];

          if (
            JSON.stringify(
              oldCookies
            ) !==
            JSON.stringify(
              currentAppState
            )
          ) {
            fileData[cookieKey] =
              currentAppState;

            hasChanged = true;
          }
        }
      } catch (_) {
        if (
          rawData !==
          JSON.stringify(
            currentAppState,
            null,
            2
          )
        ) {
          fileData =
            currentAppState;

          hasChanged = true;
        }
      }

      if (hasChanged) {
        const output =
          typeof fileData ===
          "string"
            ? fileData
            : JSON.stringify(
                fileData,
                null,
                2
              );

        fs.writeFileSync(
          accountFilePath,
          output,
          "utf8"
        );

        console.log(
          `[Cookie-Sync] 🔄 تم تحديث الكوكيز تلقائياً في: ${path.basename(
            accountFilePath
          )}`
        );
      }
    } catch (_) {
      // تجاهل الأخطاء العابرة
    }
  }, CHECK_INTERVAL);
})();
