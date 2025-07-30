// frontend/run_test.js
document.addEventListener('DOMContentLoaded', async () => {
  const logElement = document.getElementById('results-log');
  const statusBanner = document.getElementById('status-banner');
  const testScript = localStorage.getItem('playwrightTestScript');

  if (!testScript) {
    logElement.textContent = 'Error: No test script found to run.';
    return;
  }

  try {
    const res = await fetch('/run-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testCaseText: testScript }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to run test.');
    }

    // Display status banner
    const statusDiv = document.createElement('div');
    statusDiv.className = `status ${data.passed ? 'passed' : 'failed'}`;
    statusDiv.textContent = data.passed ? '✅ Test Passed' : '❌ Test Failed';
    statusBanner.appendChild(statusDiv);

    // Display logs
    logElement.textContent = data.logs.join('\n');
  } catch (err) {
    const statusDiv = document.createElement('div');
    statusDiv.className = 'status failed';
    statusDiv.textContent = '❌ Test Failed';
    statusBanner.appendChild(statusDiv);
    logElement.textContent = `An error occurred:\n${err.message}`;
  } finally {
    // Clean up the stored script
    localStorage.removeItem('playwrightTestScript');
  }
});