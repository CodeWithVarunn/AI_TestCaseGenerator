const { exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

async function runPlaywrightTest(scriptContent) {
  const projectRoot = path.join(__dirname, '..');
  const tempDir = path.join(projectRoot, 'tests', 'temp');
  const tempTestPath = path.join(tempDir, `temp-test-${Date.now()}.spec.js`);
  
  try {
    await fs.ensureDir(tempDir);
    await fs.writeFile(tempTestPath, scriptContent);
    
    const playwrightExecutable = path.join(projectRoot, 'node_modules', '.bin', 'playwright');
    const command = `"${playwrightExecutable}" test "${tempTestPath}" --reporter=json`;

    const output = await new Promise((resolve, reject) => {
      exec(command, { cwd: projectRoot }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Exec error: ${error.message}\nStderr: ${stderr}`));
          return;
        }
        resolve(stdout);
      });
    });

    const report = JSON.parse(output);
    let passed = true;
    const logs = [`Raw report: ${JSON.stringify(report, null, 2)}`];
    return { passed, logs };

  } catch (err) {
    return { passed: false, logs: [err.message] };
  } finally {
    if (await fs.exists(tempTestPath)) {
      await fs.remove(tempTestPath);
    }
  }
}

module.exports = { runPlaywrightTest };