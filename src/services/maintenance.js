// src/services/maintenance.js
const Clip = require('../models/Clip');

let timer = null;

function runOnce() {
  try {
    const purged = Clip.purgeExpiredOlderThan(7);
    if (purged > 0) console.log(`[maintenance] purged ${purged} expired clips`);
  } catch (err) {
    console.error('[maintenance] failed:', err.message);
  }
}

function start(intervalMs = 60 * 60 * 1000) {
  runOnce();
  timer = setInterval(runOnce, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

function stop() {
  if (timer) clearInterval(timer);
}

module.exports = { start, stop, runOnce };
