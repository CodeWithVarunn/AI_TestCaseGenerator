const puppeteer = require("puppeteer");
const fs = require("fs-extra");
const path = require("path");

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function generateSafeFilename() {
  return `${Date.now()}.png`;
}

function extractSteps(rawText) {
  return rawText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) =>
      line &&
      !/^Test Case/i.test(line) &&
      !/^Preconditions?:?/i.test(line) &&
      !/^Expected Result:?/i.test(line)
    );
}

function isContextOnly(step) {
  const contextPhrases = [
    "user has internet",
    "browser is open",
    "user is logged in",
    "system is running",
    "homepage",
    "preconditions",
    "expected result"
  ];
  return contextPhrases.some((p) => step.toLowerCase().includes(p));
}

function fuzzyMatchSelector(step) {
  const map = [
    { keyword: "username", selectors: ["#username", "input[name='username']"] },
    { keyword: "password", selectors: ["#password", "input[name='password']"] },
    { keyword: "login", selectors: ["button[type='submit']", ".login-btn", "button"] },
    { keyword: "search", selectors: ["input[name='search']", ".search-input"] },
    { keyword: "upload", selectors: ["input[type='file']", "#resume", ".upload", "input.upload", "input#fileUpload"] },
    { keyword: "add to cart", selectors: [".add-to-cart", "button.add", "button.cart"] },
  ];

  for (const item of map) {
    if (step.toLowerCase().includes(item.keyword)) {
      return item.selectors;
    }
  }

  return [];
}

async function trySelector(page, selectors, action, value = "") {
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: 3000 });
      if (action === "type") {
        await page.type(selector, value);
        return `Typed "${value}" into "${selector}"`;
      }
      if (action === "click") {
        await page.click(selector);
        return `Clicked "${selector}"`;
      }
      if (action === "upload") {
        const fileInput = await page.$(selector);
        if (fileInput) {
          const dummyFilePath = path.join(__dirname, "dummy.pdf");
          if (!fs.existsSync(dummyFilePath)) throw new Error("dummy.pdf not found");
          await fileInput.uploadFile(dummyFilePath);
          return `Uploaded file via "${selector}"`;
        }
      }
    } catch (_) {
      // Try next selector silently
    }
  }
  return null;
}

async function runTestCase(testCaseText) {
  const steps = extractSteps(testCaseText);
  const logs = [];
  const screenshotDir = path.join(__dirname, "test-results");
  await fs.ensureDir(screenshotDir);
  const screenshotPath = path.join(screenshotDir, generateSafeFilename());

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  let passed = true;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step || step.length < 2) continue;

    const lowercase = step.toLowerCase();
    try {
      if (isContextOnly(lowercase)) {
        logs.push(`⚠️ Step skipped: "${step}" (not actionable)`);
        continue;
      }

      if (lowercase.includes("navigate to")) {
        const url = step.match(/https?:\/\/[^\s]+/i)?.[0];
        if (url) {
          await page.goto(url);
          logs.push(`🌐 Navigated to ${url}`);
        } else {
          throw new Error("No URL found in navigate step");
        }
      }

      else if (lowercase.includes("enter") || lowercase.includes("type")) {
        const match = step.match(/\"(.+?)\".*?\"(.+?)\"/);
        if (match) {
          const [_, value, selector] = match;
          await page.waitForSelector(selector, { timeout: 3000 });
          await page.type(selector, value);
          logs.push(`⌨️ Entered "${value}" into "${selector}"`);
        } else {
          const fallback = await trySelector(page, fuzzyMatchSelector(step), "type", "fallback");
          if (fallback) logs.push(`🔄 ${fallback}`);
          else throw new Error("No valid selector found to type");
        }
      }

      else if (lowercase.includes("click")) {
        const selectorMatch = step.match(/\"(.+?)\"/);
        const fallbackSelectors = fuzzyMatchSelector(step);
        const selectors = selectorMatch ? [selectorMatch[1], ...fallbackSelectors] : fallbackSelectors;
        const clicked = await trySelector(page, selectors, "click");
        if (clicked) logs.push(`🖱️ ${clicked}`);
        else throw new Error("Click failed (no valid selector)");
      }

      else if (lowercase.includes("upload")) {
        const uploaded = await trySelector(page, fuzzyMatchSelector(step), "upload");
        if (uploaded) logs.push(`📤 ${uploaded}`);
        else throw new Error("Upload failed (input field not found)");
      }

      else {
        logs.push(`⚠️ Step skipped: "${step}" (no fallback available)`);
      }

      await delay(500);
    } catch (err) {
      logs.push(`❌ Step ${i + 1} failed: ${err.message}`);
      passed = false;
    }
  }

  await page.screenshot({ path: screenshotPath });
  await browser.close();

  return {
    passed,
    logs,
    screenshot: screenshotPath,
  };
}

module.exports = { runTestCase };











