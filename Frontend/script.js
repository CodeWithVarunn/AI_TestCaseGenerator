let lastOutput = '';
let lastOutputFormat = 'text';
let currentRefinementContext = {
  originalTestCase: '',
  testCaseId: null,
};


function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('show');
  }, 100);
  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove());
  }, 4000);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader);
    reader.readAsText(file);
  });
}

// ⭐ Functions to manage the Knowledge Base
async function fetchAndDisplayKBFiles() {
    try {
        const res = await fetch('http://localhost:5000/api/knowledge-base');
        if (!res.ok) throw new Error('Failed to fetch files.');
        const files = await res.json();
        
        const listDiv = document.getElementById('kb-files-list');
        listDiv.innerHTML = ''; // Clear current list

        if (files.length === 0) {
            listDiv.innerHTML = '<p style="font-style: italic; color: var(--secondary-color);">No documents in the knowledge base.</p>';
        } else {
            files.forEach(file => {
                const fileElement = document.createElement('div');
                fileElement.className = 'kb-file-item';
                fileElement.innerHTML = `
                    <span>📚 ${file.document_name}</span>
                    <button class="kb-delete-btn" onclick="handleKBDelete(${file.id}, '${file.document_name}')" title="Delete File">
                        &times;
                    </button>
                `;
                listDiv.appendChild(fileElement);
            });
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function handleKBUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('kbfile', file);

    showToast('Uploading document...', 'info');

    try {
        const res = await fetch('http://localhost:5000/api/knowledge-base/upload', {
            method: 'POST',
            body: formData,
        });
        if (!res.ok) throw new Error('Upload failed.');
        
        showToast('Document uploaded successfully!', 'success');
        fetchAndDisplayKBFiles(); // Refresh the list
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        // Reset the file input so you can upload the same file again
        event.target.value = '';
    }
}

async function handleKBDelete(fileId, fileName) {
    if (!confirm(`Are you sure you want to delete "${fileName}"?`)) {
        return;
    }

    try {
        const res = await fetch(`http://localhost:5000/api/knowledge-base/${fileId}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('Deletion failed.');
        
        showToast('Document deleted successfully!', 'success');
        fetchAndDisplayKBFiles(); // Refresh the list
    } catch (err) {
        showToast(err.message, 'error');
    }
}


window.addEventListener('DOMContentLoaded', () => {
  const savedInput = sessionStorage.getItem('lastInput');
  const savedOutput = sessionStorage.getItem('lastOutput');
  const savedTheme = localStorage.getItem('theme');
  if (savedInput) document.getElementById('requirement').value = savedInput;
  if (savedOutput) {
    lastOutput = savedOutput;
    renderFormattedOutput(savedOutput);
  }
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    document.getElementById('themeToggle').checked = true;
  }

  document.querySelectorAll('.custom-select').forEach(setupCustomSelect);
  function setupCustomSelect(customSelect) {
    const trigger = customSelect.querySelector('.custom-select__trigger');
    const options = customSelect.querySelectorAll('.custom-option');
    const triggerText = trigger.querySelector('span');
    const isMultiSelect = customSelect.dataset.multiSelect === 'true';
    trigger.addEventListener('click', () => {
      document.querySelectorAll('.custom-select').forEach((otherSelect) => {
        if (otherSelect !== customSelect) {
          otherSelect.classList.remove('open');
        }
      });
      customSelect.classList.toggle('open');
    });
    options.forEach((option) => {
      option.addEventListener('click', () => {
        if (isMultiSelect) {
          option.classList.toggle('selected');
        } else {
          options.forEach((o) => o.classList.remove('selected'));
          option.classList.add('selected');
          customSelect.classList.remove('open');
        }
        updateTriggerText();
      });
    });
    function updateTriggerText() {
      const selectedOptions = customSelect.querySelectorAll('.custom-option.selected');
      if (selectedOptions.length === 0) {
        triggerText.textContent = 'Select...';
      } else if (isMultiSelect) {
        if (selectedOptions.length <= 2) {
          triggerText.textContent = Array.from(selectedOptions).map((o) => o.textContent.trim().replace('✔', '').trim()).join(', ');
        } else {
          triggerText.textContent = `${selectedOptions.length} items selected`;
        }
      } else {
        triggerText.textContent = selectedOptions[0].textContent.trim().replace('✔', '').trim();
      }
    }
    updateTriggerText();
  }
  window.addEventListener('click', (e) => {
    document.querySelectorAll('.custom-select').forEach((select) => {
      if (!select.contains(e.target)) {
        select.classList.remove('open');
      }
    });
  });

  const modal = document.getElementById('refine-modal');
  const closeModalBtn = document.querySelector('.modal-close-btn');
  const sendModalBtn = document.getElementById('modal-send-btn');
  if (modal && closeModalBtn && sendModalBtn) {
    closeModalBtn.onclick = () => { modal.style.display = 'none'; };
    sendModalBtn.onclick = handleRefineSend;
    window.onclick = (event) => { if (event.target == modal) { modal.style.display = 'none'; } };
  }

  document.getElementById('themeToggle').addEventListener('change', (e) => {
    if (e.target.checked) {
      document.body.classList.add('dark-mode');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark-mode');
      localStorage.setItem('theme', 'light');
    }
  });

  document.getElementById('kb-upload-file').addEventListener('change', handleKBUpload);
  fetchAndDisplayKBFiles();
  document.getElementById('clearBtn').addEventListener('click', () => {
      const finalOutputDiv = document.getElementById('finalOutput');
      finalOutputDiv.innerHTML = '';
      document.getElementById('clear-btn-container').style.display = 'none';
      lastOutput = '';
      showToast('Results cleared!', 'info');
  });
});

async function handleFeedback(caseIndex, feedbackType) {
  const testCaseElement = document.getElementById(`test-case-${caseIndex}`);
  if (!testCaseElement) return;
  let testCaseContent = testCaseElement.innerText;
  testCaseContent = testCaseContent.replace(/👍\s*👎\s*Refine 💬/, '').trim();
  const originalPrompt = document.getElementById('requirement').value;
  try {
    const response = await fetch('http://localhost:5000/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        testCaseContent: testCaseContent,
        feedbackType: feedbackType,
        originalPrompt: originalPrompt
      })
    });
    if (!response.ok) throw new Error('Server responded with an error.');
    showToast('Thanks for your feedback!', 'success');
    const buttonDiv = document.getElementById(`feedback-buttons-${caseIndex}`);
    if (buttonDiv) {
      buttonDiv.innerHTML = '<span>Feedback Saved!</span>';
    }
  } catch (err) {
    console.error('❌ Feedback Error:', err);
    showToast('Could not save feedback.', 'error');
  }
}

// ⭐ THIS ENTIRE FUNCTION IS REWRITTEN TO FIX THE BUG
function renderFormattedOutput(rawText, format = 'text') {
    const finalOutputDiv = document.getElementById('finalOutput');
    finalOutputDiv.innerHTML = '';

    if (format === 'playwright') {
        const caseId = 0;
        const escapedCode = rawText.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const testCaseDiv = document.createElement('div');
        testCaseDiv.className = 'test-case';
        testCaseDiv.id = `test-case-${caseId}`;
        testCaseDiv.innerHTML = `<div class="test-case-content"><pre><code class="language-js">${escapedCode}</code></pre></div>`;
        const feedbackDiv = document.createElement('div');
        feedbackDiv.className = 'feedback-buttons';
        feedbackDiv.id = `feedback-buttons-${caseId}`;
        feedbackDiv.innerHTML = `<button onclick="handleFeedback(${caseId}, 'positive')" title="I like this test case">👍</button><button onclick="handleFeedback(${caseId}, 'negative')" title="I don't like this test case">👎</button><button onclick="openRefineChat(${caseId})" title="Refine this test case">Refine 💬</button>`;
        testCaseDiv.appendChild(feedbackDiv);
        finalOutputDiv.appendChild(testCaseDiv);
        if (window.Prism) Prism.highlightAll();
        document.getElementById('clear-btn-container').style.display = 'block';
        return;
    }
    
    const testCaseTitleRegex = /Test Case\s+\d+[:]?/i;
    const firstTestCaseIndex = rawText.search(testCaseTitleRegex);

    // If no "Test Case" string is found, treat the whole output as a single block of text and do NOT add buttons.
    if (firstTestCaseIndex === -1) {
        const introP = document.createElement('p');
        introP.className = 'intro-text';
        introP.textContent = rawText;
        finalOutputDiv.appendChild(introP);
        document.getElementById('clear-btn-container').style.display = 'block';
        return; 
    }

    // Separate the text that comes BEFORE the first test case.
    const introText = rawText.substring(0, firstTestCaseIndex).trim();
    // The rest of the text, starting from the first test case.
    const testCasesText = rawText.substring(firstTestCaseIndex).trim();

    if (introText) {
        const introP = document.createElement('p');
        introP.className = 'intro-text';
        // Simple formatting for the intro text to handle newlines.
        introP.innerHTML = introText.replace(/\*/g, '').replace(/\n/g, '<br>');
        finalOutputDiv.appendChild(introP);
    }
    
    if (testCasesText) {
        // This part now ONLY processes the actual test cases.
        const testCaseBlocks = testCasesText.split(/(?=Test Case\s+\d+[:]?)/i);
        testCaseBlocks.forEach((block, index) => {
            if (block.trim() === '') return;
            const testCaseDiv = document.createElement('div');
            testCaseDiv.className = 'test-case';
            testCaseDiv.id = `test-case-${index}`;
            const contentContainer = document.createElement('div');
            contentContainer.className = 'test-case-content';
            const lines = block.trim().split('\n').filter(line => line.trim() !== '');
            lines.forEach(line => {
                const sectionTitleRegex = /^(Preconditions|Steps|Expected Result):/i;
                const titleMatch = line.match(sectionTitleRegex);
                if (testCaseTitleRegex.test(line)) {
                    const h3 = document.createElement('h3');
                    h3.textContent = line.replace(/\*\*/g, '');
                    contentContainer.appendChild(h3);
                } else if (titleMatch) {
                    const title = titleMatch[0];
                    const content = line.substring(title.length).trim().replace(/^[-•*+]\s*/, '');
                    const pTitle = document.createElement('p');
                    pTitle.className = 'section-title';
                    pTitle.textContent = title;
                    contentContainer.appendChild(pTitle);
                    if (content) {
                        const pContent = document.createElement('p');
                        pContent.textContent = content;
                        contentContainer.appendChild(pContent);
                    }
                } else {
                    const pContent = document.createElement('p');
                    const cleanedLine = line.replace(/^[-•*+]\s*/, '').replace(/\*\*/g, '');
                    pContent.textContent = cleanedLine;
                    contentContainer.appendChild(pContent);
                }
            });
            testCaseDiv.appendChild(contentContainer);
            const feedbackDiv = document.createElement('div');
            feedbackDiv.className = 'feedback-buttons';
            feedbackDiv.id = `feedback-buttons-${index}`;
            feedbackDiv.innerHTML = `<button onclick="handleFeedback(${index}, 'positive')" title="I like this test case">👍</button><button onclick="handleFeedback(${index}, 'negative')" title="I don't like this test case">👎</button><button onclick="openRefineChat(${index})" title="Refine this test case">Refine 💬</button>`;
            testCaseDiv.appendChild(feedbackDiv);
            finalOutputDiv.appendChild(testCaseDiv);
        });
    }
    document.getElementById('clear-btn-container').style.display = 'block';
}

document.getElementById('generateBtn').addEventListener('click', async (e) => {
  e.preventDefault();
  const generateBtn = e.target;
  const requirementText = document.getElementById('requirement').value.trim();
  if (!requirementText) {
    showToast('Please enter a requirement.', 'error');
    return;
  }
  generateBtn.disabled = true;
  generateBtn.innerHTML = '⏳ Generating...';
  showToast('Reading files and preparing request...', 'info');
  try {
    const getSelectedValue = (id) => document.querySelector(`.custom-select[data-id="${id}"] .custom-option.selected`)?.dataset.value || '';
    const getSelectedValues = (id) => Array.from(document.querySelectorAll(`.custom-select[data-id="${id}"] .custom-option.selected`)).map((opt) => opt.dataset.value);
    const testType = getSelectedValue('testtype');
    const complexity = parseInt(getSelectedValue('complexity')) || 2;
    const testCount = parseInt(getSelectedValue('testcount')) || 2;
    const outputFormat = getSelectedValue('outputFormat');
    const dataCategories = getSelectedValues('dataVariations');
    const useKnowledgeBase = document.getElementById('use-kb').checked;
    const codeFileInput = document.getElementById('app-code-files');
    const docsFileInput = document.getElementById('app-docs-file');
    let appCodeContent = '';
    let appDocsContent = '';
    sessionStorage.setItem('lastInput', requirementText);
    if (docsFileInput.files.length > 0) {
      appDocsContent = await readFileAsText(docsFileInput.files[0]);
    }
    if (codeFileInput.files.length > 0) {
      const allFileContents = await Promise.all(Array.from(codeFileInput.files).map((file) => readFileAsText(file)));
      appCodeContent = allFileContents.map((content, index) => `--- FILE: ${codeFileInput.files[index].name} ---\n${content}`).join('\n\n');
    }
    const res = await fetch('http://localhost:5000/generate-testcase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputText: requirementText,
        testType,
        complexity,
        testCount,
        outputFormat,
        appCode: appCodeContent,
        appDocs: appDocsContent,
        dataCategories,
        useKnowledgeBase,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch from server.');
    const message = data.fromCache === 'exact' ? 'Found exact match in cache!' : 'Generated successfully!';
    showToast(message, 'success');
    lastOutput = data.testCase.raw || '';
    lastOutputFormat = data.outputFormat;
    sessionStorage.setItem('lastOutput', lastOutput);
    if (lastOutput) {
      renderFormattedOutput(lastOutput, lastOutputFormat);
    } else {
      showToast('AI returned an empty response.', 'error');
    }
  } catch (err) {
    console.error('❌ Error:', err);
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    generateBtn.disabled = false;
    generateBtn.innerHTML = 'Generate Test Cases';
  }
});

document.getElementById('extractBtn').addEventListener('click', async () => {
  const file = document.getElementById('imageInput').files[0];
  if (!file) {
    showToast('Please upload a screenshot image first.', 'error');
    return;
  }
  showToast('Extracting text from image...', 'info');
  try {
    const result = await Tesseract.recognize(file, 'eng');
    const extractedText = result.data.text.trim();
    if (extractedText) {
      document.getElementById('requirement').value = extractedText;
      showToast('Text extracted successfully.', 'success');
    } else {
      showToast('No readable text found in the image.', 'error');
    }
  } catch (err) {
    console.error('❌ OCR Error:', err);
    showToast('Failed to extract text from image.', 'error');
  }
});
document.getElementById('importFromJiraBtn').addEventListener('click', async (e) => {
    const importBtn = e.target;
    const issueKey = document.getElementById('jiraIssueKey').value.trim();
    if (!issueKey) {
      showToast('Please enter a Jira Issue Key.', 'error');
      return;
    }
    importBtn.disabled = true;
    importBtn.innerText = 'Importing...';
    showToast(`Importing issue ${issueKey}...`, 'info');
    try {
      const res = await fetch('http://localhost:5000/import-from-jira', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to import from Jira.');
      document.getElementById('requirement').value = data.requirementText;
      showToast(`Successfully imported ${issueKey}.`, 'success');
    } catch (err) {
      console.error('❌ Jira Import Error:', err);
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      importBtn.disabled = false;
      importBtn.innerText = '⬇️ Import from Jira';
    }
});
document.getElementById('sendToZephyrBtn').addEventListener('click', async (e) => {
    const sendBtn = e.target;
    if (!lastOutput) {
      showToast('No test cases have been generated to send.', 'error');
      return;
    }
    sendBtn.disabled = true;
    sendBtn.innerText = 'Sending...';
    showToast('Sending test cases to Jira/Zephyr...', 'info');
    try {
      const res = await fetch('http://localhost:5000/create-zephyr-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testCaseText: lastOutput }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || 'Failed to create tests in Jira.');
      showToast(data.message, 'success');
    } catch (err) {
      console.error('❌ Zephyr Send Error:', err);
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerText = '⬆️ Send to Zephyr';
    }
});
document.getElementById('copyBtn').addEventListener('click', () => {
  if (lastOutput) {
    navigator.clipboard.writeText(lastOutput);
    showToast('Copied to clipboard!', 'success');
  } else {
    showToast('Nothing to copy.', 'error');
  }
});
document.getElementById('downloadTxtBtn').addEventListener('click', () => {
  if (lastOutput) {
    const blob = new Blob([lastOutput], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'test-cases.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Download started.', 'success');
  } else {
    showToast('Nothing to download.', 'error');
  }
});
document.getElementById('runTestBtn').addEventListener('click', () => {
  if (lastOutputFormat !== 'playwright') {
    showToast('Please generate a Playwright script first to run a test.', 'error');
    return;
  }
  if (!lastOutput) {
    showToast('No test script available to run.', 'error');
    return;
  }
  localStorage.setItem('playwrightTestScript', lastOutput);
  window.open('run_test.html', '_blank');
});
function openRefineChat(caseIndex) {
  const modal = document.getElementById('refine-modal');
  const chatHistoryDiv = document.getElementById('modal-chat-history');
  const chatInput = document.getElementById('modal-chat-input');
  const testCaseElement = document.getElementById(`test-case-${caseIndex}`);
  if (!testCaseElement || !modal || !chatHistoryDiv || !chatInput) return;
  const contentContainer = testCaseElement.querySelector('.test-case-content');
  const originalTestCase = contentContainer ? contentContainer.innerText : testCaseElement.querySelector('pre').innerText;
  currentRefinementContext.originalTestCase = originalTestCase;
  currentRefinementContext.testCaseId = caseIndex;
  chatHistoryDiv.innerHTML = `
    <div class="chat-message ai">
      <p>This is the test case you want to refine. How should I change it?</p>
      <pre>${originalTestCase.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
    </div>
  `;
  chatInput.value = '';
  modal.style.display = 'block';
  chatInput.focus();
}
async function handleRefineSend() {
  const chatHistoryDiv = document.getElementById('modal-chat-history');
  const chatInput = document.getElementById('modal-chat-input');
  const sendModalBtn = document.getElementById('modal-send-btn');
  if(!chatHistoryDiv || !chatInput || !sendModalBtn) return;
  const refinementInstruction = chatInput.value.trim();
  if (!refinementInstruction) return;
  let currentTestCase = currentRefinementContext.originalTestCase;
  chatHistoryDiv.innerHTML += `
    <div class="chat-message user">
      <p>${refinementInstruction}</p>
    </div>
  `;
  chatInput.value = '';
  sendModalBtn.disabled = true;
  sendModalBtn.innerText = '...';
  chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;
  try {
    const res = await fetch('http://localhost:5000/api/refine-testcase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originalTestCase: currentTestCase,
        refinementInstruction,
      }),
    });
    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'AI refinement failed.');
    }
    const data = await res.json();
    const refinedTestCase = data.refinedTestCase;
    chatHistoryDiv.innerHTML += `
      <div class="chat-message ai">
        <p>Here is the updated version:</p>
        <pre>${refinedTestCase.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
      </div>
    `;
    currentRefinementContext.originalTestCase = refinedTestCase;
    const mainTestCaseElement = document.getElementById(`test-case-${currentRefinementContext.testCaseId}`);
    if (mainTestCaseElement) {
        const codeBlock = mainTestCaseElement.querySelector('pre > code');
        const contentContainer = mainTestCaseElement.querySelector('.test-case-content');
        if (codeBlock) {
            codeBlock.textContent = refinedTestCase;
            if(window.Prism) Prism.highlightElement(codeBlock);
        } else if (contentContainer) {
            const newContentDiv = document.createElement('div');
            const lines = refinedTestCase.trim().split('\n').filter(line => line.trim() !== '');
            const testCaseTitleRegex = /Test Case\s+\d+[:]?/i;
            lines.forEach(line => {
                const sectionTitleRegex = /^(Preconditions|Steps|Expected Result):/i;
                const titleMatch = line.match(sectionTitleRegex);
                if (testCaseTitleRegex.test(line)) {
                    const h3 = document.createElement('h3');
                    h3.textContent = line.replace(/\*\*/g, '');
                    newContentDiv.appendChild(h3);
                } else if (titleMatch) {
                    const pTitle = document.createElement('p');
                    pTitle.className = 'section-title';
                    pTitle.textContent = titleMatch[0];
                    newContentDiv.appendChild(pTitle);
                    const content = line.substring(titleMatch[0].length).trim().replace(/^[-•*+]\s*/, '');
                    if (content) {
                        const pContent = document.createElement('p');
                        pContent.textContent = content;
                        newContentDiv.appendChild(pContent);
                    }
                } else {
                    const pContent = document.createElement('p');
                    pContent.textContent = line.replace(/^[-•*+]\s*/, '').replace(/\*\*/g, '');
                    newContentDiv.appendChild(pContent);
                }
            });
            contentContainer.innerHTML = newContentDiv.innerHTML;
        }
    }
  } catch (err) {
    chatHistoryDiv.innerHTML += `
      <div class="chat-message ai">
        <p>Sorry, I encountered an error: ${err.message}</p>
      </div>
    `;
  } finally {
    sendModalBtn.disabled = false;
    sendModalBtn.innerText = 'Send';
    chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;
  }
}

