/**
 * Shared headless-browser launcher for generate.js (text measuring) and
 * export-pdf.js. Uses Playwright's own Chromium; set KD_CHROMIUM_PATH to
 * point at a different Chrome/Chromium executable if needed.
 */
const { chromium } = require('playwright');

module.exports = function launchBrowser() {
  const executablePath = process.env.KD_CHROMIUM_PATH || undefined;
  return chromium.launch(executablePath ? { executablePath } : {});
};
