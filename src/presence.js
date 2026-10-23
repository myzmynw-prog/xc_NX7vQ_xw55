"use strict";

// Facebook's presence flag is refreshed in cycles without sending messages.
// Each online period is random between two and three hours; offline lasts 15 minutes.
const ONLINE_MIN_MS = 2 * 60 * 60 * 1000;
const ONLINE_MAX_MS = 3 * 60 * 60 * 1000;
const OFFLINE_MS = 15 * 60 * 1000;

function randomOnlineDuration() {
  return ONLINE_MIN_MS + Math.floor(Math.random() * (ONLINE_MAX_MS - ONLINE_MIN_MS + 1));
}

function apply(api, online) {
  try {
    api?.setOptions?.({ online, updatePresence: true });
  } catch (_) {}
}

function start(api) {
  if (!api || global.GoatBot?.presenceCycleStarted) return;
  if (!global.GoatBot) global.GoatBot = {};
  global.GoatBot.presenceCycleStarted = true;
  const cycle = { timer: null, stopped: false };
  global.GoatBot.presenceCycle = cycle;

  const scheduleOnline = () => {
    if (cycle.stopped) return;
    apply(api, true);
    cycle.timer = setTimeout(scheduleOffline, randomOnlineDuration());
  };
  const scheduleOffline = () => {
    if (cycle.stopped) return;
    apply(api, false);
    cycle.timer = setTimeout(scheduleOnline, OFFLINE_MS);
  };
  scheduleOnline();
}

function stop() {
  const cycle = global.GoatBot?.presenceCycle;
  if (cycle) {
    cycle.stopped = true;
    if (cycle.timer) clearTimeout(cycle.timer);
  }
  if (global.GoatBot) global.GoatBot.presenceCycleStarted = false;
}

module.exports = { start, stop };
