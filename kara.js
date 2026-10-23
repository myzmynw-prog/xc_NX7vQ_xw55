const { login } = require("@dongdev/fca-unofficial");
const fs = require("fs");
const path = require("path");

// ==========================================
// 1. استدعاء presence.js
// ==========================================
let presence = null;

const presencePaths = [
  path.join(__dirname, "src", "presence.js"),
  path.join(__dirname, "presence.js"),
  path.join(__dirname, "src", "presence"),
  path.join(__dirname, "presence")
];

for (const pPath of presencePaths) {
  if (fs.existsSync(pPath) || fs.existsSync(`${pPath}.js`)) {
    try {
      presence = require(pPath);
      break;
    } catch (pErr) {
      console.error(
        `⚠️ فشل تحميل presence من [${pPath}]:`,
        pErr.message
      );
    }
  }
}

const triggerPresence = (apiInstance) => {
  if (!presence || !apiInstance) return;

  try {
    if (typeof presence.start === "function") {
      presence.start(apiInstance);
    } else if (typeof presence === "function") {
      presence(apiInstance);
    } else if (typeof presence.init === "function") {
      presence.init(apiInstance);
    }
  } catch (err) {
    console.error(
      "⚠️ خطأ أثناء تنفيذ presence:",
      err.message
    );
  }
};

const botStartTime = Date.now();

if (!global.GoatBot) global.GoatBot = {};
if (!global._msgListeners) global._msgListeners = [];

let config = {};
const configPath = path.join(__dirname, "config.json");

// ==========================================
// قراءة config
// ==========================================
function loadConfig() {
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(
        fs.readFileSync(configPath, "utf8")
      );
    } catch (err) {
      console.error(
        "❌ خطأ في قراءة ملف config.json:",
        err.message
      );
    }
  } else {
    console.warn(
      "⚠️ لم يتم العثور على ملف config.json"
    );
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(
      configPath,
      JSON.stringify(config, null, 2),
      "utf8"
    );

    console.log(
      "✅ تم حفظ التحديثات في config.json بنجاح."
    );
  } catch (err) {
    console.error(
      "❌ خطأ أثناء حفظ config.json:",
      err.message
    );
  }
}

loadConfig();

// ==========================================
// 🔒 حالة قفل البوت
// ==========================================
let botLocked = false;

// ==========================================
// الأنظمة الداخلية
// ==========================================
const activeFeatures = new Map();
const userMessageTracker = new Map();

setInterval(() => {
  const now = Date.now();
  const windowMs =
    Number(config.rateLimit?.windowMs) || 8000;

  for (const [userID, timestamps] of userMessageTracker.entries()) {
    const valid = timestamps.filter(
      ts => now - ts < windowMs
    );

    if (valid.length === 0) {
      userMessageTracker.delete(userID);
    } else {
      userMessageTracker.set(userID, valid);
    }
  }

  for (const [threadID, featureSet] of activeFeatures.entries()) {
    if (featureSet.size === 0) {
      activeFeatures.delete(threadID);
    }
  }
}, 5 * 60 * 1000);

// ==========================================
// Group Manager
// ==========================================
const groupManager = {
  isEnabled: (threadID, featureName) => {
    if (!activeFeatures.has(threadID)) return false;

    return activeFeatures
      .get(threadID)
      .has(featureName);
  },

  enable: (threadID, featureName) => {
    if (!activeFeatures.has(threadID)) {
      activeFeatures.set(
        threadID,
        new Set()
      );
    }

    activeFeatures
      .get(threadID)
      .add(featureName);
  },

  disable: (threadID, featureName) => {
    if (activeFeatures.has(threadID)) {
      const set =
        activeFeatures.get(threadID);

      set.delete(featureName);

      if (set.size === 0) {
        activeFeatures.delete(threadID);
      }
    }
  }
};

// ==========================================
// قراءة قائمة الأدمن والمالك
// ==========================================
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
          if (
            id !== undefined &&
            id !== null
          ) {
            targetSet.add(
              String(id).trim()
            );
          }
        });
      } else if (
        typeof val === "string" ||
        typeof val === "number"
      ) {
        String(val)
          .split(/[\s,;]+/)
          .forEach(id => {
            if (id) {
              targetSet.add(
                String(id).trim()
              );
            }
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

// ==========================================
// تحديد صلاحية المستخدم
// 3 = مالك البوت
// 2 = أدمن البوت
// 1 = أدمن المجموعة
// 0 = عضو عادي
// ==========================================
function getUserPermission(
  senderID,
  threadInfo,
  config
) {
  const {
    superSet,
    adminSet
  } = getAdminLists(config);

  const idStr =
    String(senderID).trim();

  if (superSet.has(idStr)) {
    return 3;
  }

  if (adminSet.has(idStr)) {
    return 2;
  }

  if (
    threadInfo &&
    Array.isArray(threadInfo.adminIDs)
  ) {
    const isGroupAdmin =
      threadInfo.adminIDs.some(
        admin =>
          String(
            admin.id
          ).trim() === idStr
      );

    if (isGroupAdmin) {
      return 1;
    }
  }

  return 0;
}

// ==========================================
// Stealth
// ==========================================
function isStealthActive(cfg) {
  if (
    !cfg.stealth ||
    !cfg.stealth.enable
  ) {
    return false;
  }

  const currentHour =
    new Date().getHours();

  const start =
    cfg.stealth.sleepHourStart ?? 1;

  const end =
    cfg.stealth.sleepHourEnd ?? 7;

  if (start < end) {
    return (
      currentHour >= start &&
      currentHour < end
    );
  } else {
    return (
      currentHour >= start ||
      currentHour < end
    );
  }
}

// ==========================================
// Rate Limit
// ==========================================
function isRateLimited(
  senderID,
  cfg
) {
  if (!cfg.rateLimit) return false;

  const max =
    Number(
      cfg.rateLimit.maxMessagesPerWindow
    ) || 5;

  const windowMs =
    Number(
      cfg.rateLimit.windowMs
    ) || 8000;

  const now = Date.now();

  const timestamps =
    (
      userMessageTracker.get(
        senderID
      ) || []
    ).filter(
      ts =>
        now - ts < windowMs
    );

  if (timestamps.length >= max) {
    userMessageTracker.set(
      senderID,
      timestamps
    );

    return true;
  }

  timestamps.push(now);

  userMessageTracker.set(
    senderID,
    timestamps
  );

  return false;
}

// ==========================================
// معالجة AppState
// ==========================================
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
          const i =
            part.indexOf("=");

          if (i === -1) {
            return null;
          }

          return {
            key: part
              .slice(0, i)
              .trim(),

            value: part
              .slice(i + 1)
              .trim()
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
      parsed =
        Object.entries(parsed)
          .map(([key, value]) => ({
            key,
            value: String(value)
          }));
    }
  }

  if (Array.isArray(parsed)) {
    return parsed
      .map(cookie => {
        if (
          !cookie ||
          typeof cookie !== "object"
        ) {
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

        if (
          !key ||
          value === undefined
        ) {
          return null;
        }

        return {
          key: String(key),
          value: String(value),
          domain:
            cookie.domain ||
            "facebook.com",
          path: "/"
        };
      })
      .filter(Boolean);
  }

  throw new Error(
    "صيغة الكوكيز غير مدعومة."
  );
}

// ==========================================
// account.txt
// ==========================================
const accountFilePath =
  path.join(
    __dirname,
    "account.txt"
  );

let appStateData;
let lastAccountFileReadTime =
  Date.now();

try {
  if (
    fs.existsSync(
      accountFilePath
    )
  ) {
    const rawData =
      fs.readFileSync(
        accountFilePath,
        "utf8"
      );

    appStateData =
      normalizeAppState(
        rawData
      );

    lastAccountFileReadTime =
      fs.statSync(
        accountFilePath
      ).mtimeMs;
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

// ==========================================
// تحميل الأوامر
// ==========================================
const commands = new Map();
const aliases = new Map();
const eventHandlers = new Map();

const possibleCmdPaths = [
  path.join(
    __dirname,
    "src",
    "commands"
  ),

  path.join(
    __dirname,
    "commands"
  )
];

const commandsPath =
  possibleCmdPaths.find(
    p => fs.existsSync(p)
  );

if (commandsPath) {
  const commandFiles =
    fs.readdirSync(
      commandsPath
    ).filter(
      file =>
        file.endsWith(".js")
    );

  for (const file of commandFiles) {
    try {
      const commandPath =
        path.join(
          commandsPath,
          file
        );

      delete require.cache[
        require.resolve(
          commandPath
        )
      ];

      const command =
        require(commandPath);

      const cmdConfig =
        command.config ||
        command;

      const cmdName =
        cmdConfig.name ||
        command.name;

      if (cmdName) {
        const lowerName =
          cmdName.toLowerCase();

        commands.set(
          lowerName,
          command
        );

        if (
          cmdConfig.aliases &&
          Array.isArray(
            cmdConfig.aliases
          )
        ) {
          cmdConfig.aliases.forEach(
            alias => {
              aliases.set(
                alias.toLowerCase(),
                lowerName
              );
            }
          );
        }
      }

      if (
        typeof command.handleEvent ===
          "function" ||
        typeof command.onEvent ===
          "function" ||
        typeof command.onChat ===
          "function"
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
}

// ==========================================
// GoatBot
// ==========================================
global.GoatBot = {
  ...global.GoatBot,

  startTime:
    botStartTime,

  commands:
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

// ==========================================
// تسجيل الدخول
// ==========================================
login(
  {
    appState:
      appStateData,

    autoLogin: false
  },

  (err, api) => {
    if (err) {
      console.error(
        "❌ فشل تسجيل الدخول:",
        err.message || err
      );

      process.exit(1);
    }

    console.log(
      "🚀 تم تسجيل الدخول بنجاح!"
    );

    global.GoatBot.fcaApi =
      api;

    if (
      api.getCurrentUserID
    ) {
      global.GoatBot.botID =
        api.getCurrentUserID();
    }

    api.setOptions({
      listenEvents: true,
      selfListen: false,
      logLevel: "silent",
      forceLogin: true,
      autoMarkDelivery: true,
      autoMarkRead: true,
      online: true,
      updatePresence: true,
      autoLogin: false
    });

    process.nextTick(
      () => triggerPresence(api)
    );

    setInterval(() => {
      try {
        api.setOptions({
          online: true,
          updatePresence: true
        });

        triggerPresence(api);
      } catch (_) {}
    }, 30 * 1000);

    // ==========================================
    // استقبال الرسائل
    // ==========================================
    api.listenMqtt(
      (listenErr, event) => {
        try {
          if (
            listenErr ||
            !event ||
            !event.threadID
          ) {
            return;
          }

          if (
            isStealthActive(
              config
            )
          ) {
            return;
          }

          const threadID =
            String(
              event.threadID
            );

          const senderID =
            String(
              event.senderID ||
              event.author ||
              ""
            );

          if (
            isRateLimited(
              senderID,
              config
            )
          ) {
            return;
          }

          if (
            typeof api.markAsRead ===
            "function"
          ) {
            try {
              api.markAsRead(
                threadID
              );
            } catch (_) {}
          }

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

          // ==========================================
          // Uptime
          // ==========================================
          const getUptime = () => {
            const totalSeconds =
              Math.floor(
                (Date.now() -
                  botStartTime) /
                  1000
              );

            const hours =
              Math.floor(
                totalSeconds /
                  3600
              );

            const minutes =
              Math.floor(
                (totalSeconds %
                  3600) /
                  60
              );

            const seconds =
              totalSeconds %
              60;

            return `${hours} ساعة و ${minutes} دقيقة و ${seconds} ثانية`;
          };

          // ==========================================
          // إرسال الرسائل
          // ==========================================
          const sendDelayedMessage = (
            msg,
            callback = null
          ) => {
            let str =
              typeof msg ===
              "string"
                ? msg
                : (
                    msg?.body ||
                    ""
                  );

            let typingDuration =
              3500;

            if (
              str.length > 50
            ) {
              typingDuration =
                4500;
            }

            const stopTyping =
              typeof api.sendTypingIndicator ===
              "function"
                ? api.sendTypingIndicator(
                    threadID,
                    () => {}
                  )
                : null;

            setTimeout(() => {
              if (
                typeof stopTyping ===
                "function"
              ) {
                try {
                  stopTyping();
                } catch (_) {}
              }

              if (
                typeof api.sendTypingIndicator ===
                "function"
              ) {
                try {
                  api.sendTypingIndicator(
                    threadID,
                    false,
                    () => {}
                  );
                } catch (_) {}
              }

              setTimeout(() => {
                try {
                  api.sendMessage(
                    msg,
                    threadID,
                    (
                      sendErr,
                      messageInfo
                    ) => {
                      if (
                        typeof callback ===
                        "function"
                      ) {
                        try {
                          callback(
                            sendErr,
                            messageInfo
                          );
                        } catch (
                          cbErr
                        ) {
                          console.error(
                            "❌ خطأ داخل callback الخاص بـ sendMessage:",
                            cbErr.message
                          );
                        }
                      }
                    }
                  );
                } catch (
                  sendErr
                ) {
                  console.error(
                    "❌ خطأ أثناء إرسال الرسالة:",
                    sendErr.message
                  );
                }
              }, 1000);
            }, typingDuration);
          };

          const messageHelper = {
            reply: (
              msg,
              cb
            ) =>
              sendDelayedMessage(
                msg,
                cb
              ),

            send: (
              msg,
              cb
            ) =>
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

          // ==========================================
          // معلومات المجموعة والصلاحية
          // ==========================================
          api.getThreadInfo(
            threadID,
            (
              threadErr,
              threadInfo
            ) => {
              if (threadErr) {
                threadInfo = null;
              }

              const userPermission =
                getUserPermission(
                  senderID,
                  threadInfo,
                  config
                );

              // ==========================================
              // 🔒 نظام LOCK
              // ==========================================
              //
              // /lock
              //      يقفل البوت
              //
              // /lock off
              //      يفتح البوت
              //
              // فقط permission 2 أو 3
              // يستطيع التحكم بالقفل.
              // ==========================================

              if (
                event.type ===
                  "message" &&
                event.body
              ) {
                const lockText =
                  event.body.trim();

                const prefix =
                  config.prefix ||
                  config.PREFIX ||
                  "/";

                let lockInput =
                  lockText;

                if (
                  lockInput.startsWith(
                    prefix
                  )
                ) {
                  lockInput =
                    lockInput.slice(
                      prefix.length
                    );
                } else if (
                  lockInput.startsWith(
                    "!"
                  ) ||
                  lockInput.startsWith(
                    "/"
                  )
                ) {
                  lockInput =
                    lockInput.slice(1);
                }

                const lockParts =
                  lockInput
                    .trim()
                    .split(/\s+/);

                const lockCommand =
                  (
                    lockParts[0] ||
                    ""
                  ).toLowerCase();

                const lockArgument =
                  (
                    lockParts[1] ||
                    ""
                  ).toLowerCase();

                if (
                  lockCommand ===
                    "lock" ||
                  lockCommand ===
                    "قفل"
                ) {
                  // غير الأدمن لا يحصل على رد
                  if (
                    userPermission < 2
                  ) {
                    return;
                  }

                  // /lock off
                  if (
                    lockArgument ===
                      "off" ||
                    lockArgument ===
                      "فتح" ||
                    lockArgument ===
                      "unlock" ||
                    lockArgument ===
                      "إلغاء"
                  ) {
                    botLocked =
                      false;

                    return messageHelper.reply(
                      "🔓 تم إلغاء قفل البوت.\nالآن يمكن للجميع استخدام البوت."
                    );
                  }

                  // /lock
                  botLocked =
                    true;

                  return messageHelper.reply(
                    "🔒 تم وضع قفل على البوت.\nلن يرد البوت على من لا يملك صلاحية أدمن."
                  );
                }
              }

              // ==========================================
              // 🔒 إذا كان البوت مقفلاً
              // ==========================================
              //
              // permission:
              // 0 = عضو عادي
              // 1 = أدمن المجموعة
              // 2 = أدمن البوت
              // 3 = مالك البوت
              //
              // هنا نسمح فقط لـ 2 و 3.
              // ==========================================
              if (
                botLocked &&
                userPermission < 2
              ) {
                return;
              }

              // ==========================================
              // Admin Only من config
              // ==========================================
              if (
                config.adminOnly?.enable &&
                userPermission < 2
              ) {
                return;
              }

              // ==========================================
              // Context
              // ==========================================
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
                  userPermission >= 2,

                isSuperAdmin:
                  userPermission ===
                  3,

                isOwner:
                  userPermission ===
                  3,

                userPermission,

                permssion:
                  userPermission,

                role:
                  userPermission,

                config,

                groupManager,

                // حالة القفل
                botLocked
              };

              // ==========================================
              // Event Handlers
              // ==========================================
              const eventType =
                event.logMessageType ||
                event.type;

              const isNameOrNicknameChange =
                eventType ===
                  "log:thread-name" ||
                eventType ===
                  "log:user-nickname";

              if (
                isNameOrNicknameChange
              ) {
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

                return;
              }

              // ==========================================
              // تشغيل Event Handlers
              // ==========================================
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

              // ==========================================
              // تنفيذ الأوامر
              // ==========================================
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

                let hasPrefix =
                  false;

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

                if (!hasPrefix) {
                  return;
                }

                const rawArgs =
                  cleanInput
                    .trim()
                    .split(/\s+/);

                let inputCmd =
                  rawArgs
                    .shift()
                    ?.toLowerCase() ||
                  "";

                // ==========================================
                // Alox
                // ==========================================
                if (
                  inputCmd ===
                    "alox" ||
                  inputCmd ===
                    "alex"
                ) {
                  const subCmd =
                    rawArgs[0]
                      ? rawArgs[0]
                          .toLowerCase()
                      : "";

                  if (
                    subCmd ===
                      "off" ||
                    subCmd ===
                      "إيقاف" ||
                    subCmd ===
                      "تعطيل"
                  ) {
                    groupManager.disable(
                      threadID,
                      "alox"
                    );
                  } else if (
                    subCmd ===
                      "on" ||
                    subCmd ===
                      "تشغيل" ||
                    subCmd ===
                      "تفعيل"
                  ) {
                    groupManager
