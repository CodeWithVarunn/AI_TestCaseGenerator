const express = require('express');
const cors = require('cors');
const axios = require('axios');

const stringSimilarity = require('string-similarity');
const { createClient } = require('@supabase/supabase-js');
const { runPlaywrightTest } = require('./playwrightRunner');
const multer = require('multer');
const fs = require('fs');

require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('frontend'));
const upload = multer({ dest: 'uploads/' });

// --- Helper Functions ---

function cleanOutput(text) {
  return text
    .replace(/^[*•+]\s?/gm, '')
    .replace(/^\s*-\s?/gm, '- ')
    .replace(/\*\*/g, '')
    .replace(/\r?\n{2,}/g, '\n\n')
    .trim();
}

function parseTestCasesFromText(rawText) {
  const testCases = [];
  const textBlocks = rawText.trim().split(/\n\s*\n/);
  textBlocks.forEach((block) => {
    if (!block.toLowerCase().startsWith('test case')) return;
    const lines = block.split('\n');
    const title = lines[0].replace(/Test Case \d+:\s*/, '').trim();
    let currentSection = '';
    let steps = '';
    let expectedResult = '';
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.toLowerCase().startsWith('preconditions:'))
        currentSection = 'preconditions';
      else if (line.toLowerCase().startsWith('steps:'))
        currentSection = 'steps';
      else if (line.toLowerCase().startsWith('expected result:'))
        currentSection = 'expected';
      else if (line.startsWith('-')) {
        if (currentSection === 'steps') steps += line + '\n';
        else if (currentSection === 'expected') expectedResult += line + '\n';
      }
    }
    testCases.push({ title, steps, expectedResult });
  });
  return testCases;
}

function extractTextFromAdf(adf) {
  if (!adf || !adf.content) return '';
  let text = '';
  adf.content.forEach((node) => {
    if (node.type === 'paragraph' && node.content) {
      node.content.forEach((child) => {
        if (child.type === 'text') text += child.text + ' ';
      });
      text += '\n';
    }
  });
  return text.trim();
}

function getTestCaseRange(level) {
  if (level === 1) return '1–5';
  if (level === 2) return '5–20';
  return '20+';
}

function getComplexityDescription(level) {
  if (level === 1) return 'short and simple (1–5 steps)';
  if (level === 2) return 'moderate in length (5–20 steps)';
  return 'detailed and complex (20+ steps)';
}

async function saveTestCase(input, testCaseObj) {
  const {
    testType,
    complexity,
    testCount,
    outputFormat,
    dataCategories,
    testCase,
  } = testCaseObj;

  const { data, error } = await supabase.from('test_cases').insert({
    input_text: input,
    test_type: testType,
    complexity: complexity,
    test_count: testCount,
    output_format: outputFormat,
    data_categories: dataCategories,
    generated_output: testCase.raw,
  });
  if (error) console.error('❌ Supabase save error:', error);
  else console.log('✅ Test case saved to Supabase.');
}

async function findExactMatch(
  inputText,
  testType,
  complexity,
  testCount,
  outputFormat,
  dataCategories
) {
  const sortedCategories = dataCategories.sort();
  const { data, error } = await supabase
    .from('test_cases')
    .select('generated_output')
    .eq('input_text', inputText)
    .eq('test_type', testType)
    .eq('complexity', complexity)
    .eq('test_count', testCount)
    .eq('output_format', outputFormat)
    .eq('data_categories', sortedCategories)
    .limit(1)
    .single();
  if (data) return { testCase: { raw: data.generated_output } };
  return null;
}

async function getLikedExamples(limit = 2) {
  const { data, error } = await supabase
    .from('feedback_log')
    .select('test_case_content')
    .eq('feedback_type', 'positive')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('❌ Error fetching liked examples:', error);
    return [];
  }
  return data.map((item) => item.test_case_content);
}

// ⭐ NEW: Helper function to get all knowledge base content
async function getKnowledgeBaseContent() {
    const { data, error } = await supabase.from('knowledge_base').select('content');
    if (error) {
        console.error('❌ Error fetching knowledge base:', error);
        return '';
    }
    return data.map(doc => doc.content).join('\n\n---\n\n');
}

// --- API Endpoints ---

app.get('/api/knowledge-base', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('knowledge_base')
            .select('id, document_name');
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch knowledge base files.' });
    }
});

app.post('/api/knowledge-base/upload', upload.single('kbfile'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }
        const content = fs.readFileSync(file.path, 'utf-8');
        const { error } = await supabase.from('knowledge_base').insert({
            document_name: file.originalname,
            content: content,
        });
        fs.unlinkSync(file.path); // Clean up uploaded file from server
        if (error) throw error;
        res.status(201).json({ message: 'File uploaded successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to upload file.' });
    }
});

app.delete('/api/knowledge-base/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('knowledge_base').delete().eq('id', id);
        if (error) throw error;
        res.status(200).json({ message: 'File deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete file.' });
    }
});

app.post('/api/feedback', async (req, res) => {
  const { testCaseContent, feedbackType, originalPrompt } = req.body;
  if (!testCaseContent || !feedbackType || !originalPrompt) {
    return res.status(400).json({ error: 'Missing required feedback data.' });
  }
  try {
    const { error } = await supabase.from('feedback_log').insert({
      test_case_content: testCaseContent,
      feedback_type: feedbackType,
      original_prompt: originalPrompt,
    });
    if (error) throw error;
    res.status(200).json({ message: 'Feedback saved successfully.' });
    console.log(`✅ Feedback (${feedbackType}) saved to Supabase.`);
  } catch (err) {
    console.error('❌ Supabase feedback save error:', err);
    res.status(500).json({ error: 'Failed to save feedback.' });
  }
});

app.post('/api/refine-testcase', async (req, res) => {
  const { originalTestCase, refinementInstruction } = req.body;
  if (!originalTestCase || !refinementInstruction) {
    return res
      .status(400)
      .json({ error: 'Missing original test case or instruction.' });
  }
  const prompt = `You are a test case refiner. Your task is to modify an existing test case based on a user's instruction.
Respond with ONLY the complete, raw, updated test case text. Do not add any extra explanations or markdown formatting.

--- ORIGINAL TEST CASE ---
${originalTestCase}

--- USER'S INSTRUCTION ---
${refinementInstruction}

--- REFINED TEST CASE ---
`;
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama3-70b-8192',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    const refinedTestCase = response.data.choices[0].message.content.trim();
    res.json({ refinedTestCase });
  } catch (error) {
    console.error(
      '❌ Refinement Error:',
      error.response?.data || error.message
    );
    res.status(500).json({ error: 'Failed to refine the test case.' });
  }
});

app.post('/generate-testcase', async (req, res) => {
  const {
    inputText,
    testType = 'Functional',
    complexity = 2,
    testCount = 2,
    outputFormat = 'text',
    appCode,
    appDocs,
    dataCategories = [],
    useKnowledgeBase, // ⭐ NEW: Get the checkbox value
  } = req.body;

  console.log('📨 Received request:', {
    inputText,
    testType,
    outputFormat,
    dataCategories,
    useKnowledgeBase,
  });

  const existingMatch = await findExactMatch(
    inputText,
    testType,
    complexity,
    testCount,
    outputFormat,
    dataCategories
  );
  if (existingMatch) {
    console.log('✅ Found exact match in Supabase cache.');
    return res.json({ fromCache: 'exact', outputFormat, ...existingMatch });
  }

  const likedExamples = await getLikedExamples(2);
  let feedbackInstruction = '';
  if (likedExamples.length > 0) {
    feedbackInstruction = `Based on these user-liked examples, generate test cases in a similar style and quality:\n\n--- LIKED EXAMPLE 1 ---\n${likedExamples[0]}\n\n`;
    if (likedExamples.length > 1) {
      feedbackInstruction += `--- LIKED EXAMPLE 2 ---\n${likedExamples[1]}\n\n`;
    }
  }

  // ⭐ NEW: Fetch and prepare knowledge base content
  let knowledgeBaseInstruction = '';
  if (useKnowledgeBase) {
      const kbContent = await getKnowledgeBaseContent();
      if (kbContent) {
          knowledgeBaseInstruction = `Use the following permanent knowledge base as the primary source of truth for context, standards, and requirements:\n\n--- KNOWLEDGE BASE ---\n${kbContent}\n\n--- END KNOWLEDGE BASE ---\n\n`;
      }
  }

  let scenarioInstruction = '';
  // ... (switch statement remains the same)
  switch (testType) {
    case 'Functional': scenarioInstruction = 'Generate a comprehensive mix of both positive (happy path) and negative (error, invalid input, edge case) test cases.\n\n'; break;
    case 'Regression': scenarioInstruction = "Focus on a mix of core positive paths and potential areas of failure to ensure existing functionality hasn't broken.\n\n"; break;
    case 'Integration': scenarioInstruction = 'Focus on how modules interact, including positive cases where data flows correctly and negative cases where one module sends bad data.\n\n'; break;
    case 'Smoke': scenarioInstruction = "This is a Smoke Test. Generate ONLY the most critical, high-level positive 'happy path' test cases to ensure basic functionality is working.\n\n"; break;
    default: scenarioInstruction = 'Generate a standard set of positive test cases.\n\n';
  }

  let dataVariationInstruction = '';
  if (dataCategories && dataCategories.length > 0) {
    dataVariationInstruction = `Additionally, ensure the generated test cases specifically cover the following data scenarios: ${dataCategories.join(
      ', '
    )}.\n\n`;
  }

  let formatInstruction = '';
  // ... (format instruction logic remains the same)
  if (outputFormat === 'playwright') {
    formatInstruction = `
You are an expert Playwright automation engineer. Your task is to generate a complete, production-quality Playwright test script. Follow these rules STRICTLY:
1.  **Output Format:** - Respond with ONLY the raw Playwright script code in JavaScript. - DO NOT wrap the code in markdown blocks like \`\`\`javascript.
2.  **Test Structure:** - Use the official Playwright test runner format. - Start with \`import { test, expect } from '@playwright/test';\` - Use \`test.describe()\` and \`test.beforeEach()\`.
3.  **Locators (CRITICAL):** - You MUST use modern, user-facing locators in this priority: \`page.getByRole()\`, \`page.getByLabel()\`, \`page.getByPlaceholder()\`, \`page.getByText()\`. - AVOID CSS selectors.
4.  **Assertions:** - You MUST use web-first assertions like \`await expect(page).toHaveURL(...)\`.`;
  } else {
    formatInstruction = `
You are an expert QA engineer. Follow these rules STRICTLY for formatting your response:

1.  **Do NOT use a "Common Preconditions" section.** Every test case must list all of its own preconditions, even if they are repetitive.
2.  **Minimums:** Each individual test case MUST have a minimum of two specific preconditions and a minimum of two distinct expected result verification points.
3.  **Strict Format:** Adhere to this format exactly. Do not add any introductory sentences or extra headers like "*Test Cases:*".

Test Case 1: [A concise title]
Preconditions:
- [Precondition 1]
- [Precondition 2]
Steps:
- [Step 1]
- [Step 2]
Expected Result:
- [Verification point 1]
- [Verification point 2]`;
  }

  const contextInstruction =
    appCode || appDocs
      ? `Use the following application context.\n\n--- APP DOCS ---\n${appDocs}\n\n--- APP CODE ---\n${appCode}\n\n`
      : '';

  // ⭐ NEW: Add the knowledge base instruction to the final prompt
  const prompt =
    `You are an expert QA engineer. Generate ${getTestCaseRange(
      testCount
    )} ${testType} test cases for:\n${inputText}\n\n` +
    `${knowledgeBaseInstruction}${feedbackInstruction}${contextInstruction}${scenarioInstruction}${dataVariationInstruction}` +
    `Each test case should be ${getComplexityDescription(complexity)}.\n\n` +
    `${formatInstruction}`;

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama3-70b-8192',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    let testCaseRaw = response.data.choices[0].message.content || '';
    if (outputFormat !== 'playwright') {
      testCaseRaw = cleanOutput(testCaseRaw);
    }
    const structured = {
      testType,
      complexity,
      testCount,
      outputFormat,
      dataCategories,
      testCase: { raw: testCaseRaw.trim() },
    };
    await saveTestCase(inputText, structured);
    res.json({ fromCache: false, ...structured });
  } catch (error) {
    console.error(
      '❌ Generation Error:',
      error.response?.data || error.message
    );
    res.status(500).json({ error: 'Failed to generate test case.' });
  }
});

app.post('/run-test', async (req, res) => {
  // ... (rest of the file is unchanged)
  const { testCaseText } = req.body;
  if (!testCaseText) {
    return res.status(400).json({ error: 'No test case text provided.' });
  }
  try {
    const result = await runPlaywrightTest(testCaseText);
    res.json(result);
  } catch (err) {
    console.error('❌ Runner Error:', err);
    res.status(500).json({
      error: err.message || 'An unexpected error occurred during the test run.',
    });
  }
});
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_TOKEN = process.env.JIRA_TOKEN;
const JIRA_DOMAIN = process.env.JIRA_DOMAIN;
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY;
const ZEPHYR_TEST_ISSUE_TYPE_ID = process.env.ZEPHYR_TEST_ISSUE_TYPE_ID;
const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');
app.post('/import-from-jira', async (req, res) => {
  const { issueKey } = req.body;
  if (!issueKey)
    return res.status(400).json({ error: 'Jira issue key is required.' });
  console.log(`🔎 Importing Jira issue: ${issueKey}`);
  try {
    const jiraApiUrl = `https://${JIRA_DOMAIN}/rest/api/3/issue/${issueKey}`;
    const response = await axios.get(jiraApiUrl, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    const issueData = response.data;
    const requirementText = `User Story: ${
      issueData.fields.summary
    }\n\nDescription:\n${extractTextFromAdf(issueData.fields.description)}`;
    res.json({ success: true, requirementText });
  } catch (error) {
    console.error(
      '❌ Jira Import Error:',
      error.response?.data || error.message
    );
    const errorMessage =
      error.response?.status === 404
        ? `Issue '${issueKey}' not found.`
        : 'Failed to import from Jira.';
    res.status(error.response?.status || 500).json({ error: errorMessage });
  }
});
app.post('/create-zephyr-tests', async (req, res) => {
  const { testCaseText } = req.body;
  if (!testCaseText) {
    return res.status(400).json({ error: 'No test case text provided.' });
  }
  const testCaseTitleRegex = /Test Case\s+\d+[:]?/i;
  const firstTestCaseIndex = testCaseText.search(testCaseTitleRegex);
  const parsableText =
    firstTestCaseIndex !== -1 ? testCaseText.substring(firstTestCaseIndex) : '';
  const parsedTestCases = parseTestCasesFromText(parsableText);
  if (parsedTestCases.length === 0) {
    return res.status(400).json({ error: 'Could not parse any test cases.' });
  }
  const createdIssues = [];
  const errors = [];
  for (const testCase of parsedTestCases) {
    const issuePayload = {
      fields: {
        project: { key: JIRA_PROJECT_KEY },
        summary: testCase.title,
        issuetype: { id: ZEPHYR_TEST_ISSUE_TYPE_ID },
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: `Steps:\n${testCase.steps}\n\nExpected Result:\n${testCase.expectedResult}`,
                },
              ],
            },
          ],
        },
      },
    };
    try {
      const response = await axios.post(
        `https://${JIRA_DOMAIN}/rest/api/3/issue`,
        issuePayload,
        {
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );
      createdIssues.push(response.data.key);
    } catch (err) {
      console.error(
        'Jira Creation Error:',
        err.response?.data?.errors || err.message
      );
      errors.push({
        title: testCase.title,
        error: err.response?.data?.errors || err.message,
      });
    }
  }
  if (createdIssues.length > 0)
    res.json({
      success: true,
      message: `Successfully created ${createdIssues.length} test(s).`,
      issueKeys: createdIssues,
      errors: errors,
    });
  else
    res.status(500).json({
      success: false,
      error: 'Failed to create any test cases in Jira.',
      errors: errors,
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
