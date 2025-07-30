# **AI Test Case Generator**

## **1. Overview**

The AI Test Case Generator is an intelligent, full-stack web application designed to accelerate the Quality Assurance (QA) process. It leverages the power of Large Language Models (LLMs) to automatically generate high-quality, context-aware test cases from simple feature requirements.

This tool moves beyond generic AI assistants by incorporating a persistent **Knowledge Base**, a **Feedback Loop** for continuous learning, and an **Iterative Refinement Chat**, transforming it into a smart, adaptive partner for any QA team.

## **2. Key Features**

- **🤖 AI-Powered Generation:** Instantly generate test cases in various formats, including human-readable steps and Playwright automation scripts.
- **⚙️ Dynamic Options:** Customize the output by selecting test type (Smoke, Regression, etc.), complexity, and the number of test cases.
- **🧠 Context-Awareness:**
    - **Per-Session Context:** Upload application code or documentation for one-time, highly relevant generation.
    - **Persistent Knowledge Base:** Store permanent project standards, technical documents, and style guides for the AI to use as a source of truth in all future requests.
- **👍 Continuous Learning Loop:** A Like/Dislike feedback system allows the AI to learn user preferences over time, continuously improving the style and quality of its output.
- **💬 Iterative Refinement Chat:** Select any generated test case and open a dedicated chat to make specific, conversational edits until it's perfect.
- **🧩 Integrations:**
    - **Jira:** Import user stories and requirements directly from Jira issues.
    - **Zephyr:** (Placeholder for sending tests back to Zephyr).
- **📷 OCR Support:** Upload a screenshot of a UI or a document, and the tool will extract the text using Tesseract.js to use as a requirement.
- **Features:**
    - Copy all generated text to the clipboard.
    - Download test cases as a `.txt` file.
    - Clear the screen for a new session.

## **3. Architecture Overview**

The application is built on a modern client-server architecture designed for flexibility and scalability.

- **Frontend (Client):** A dynamic, single-page interface built with vanilla HTML, CSS, and JavaScript. It handles all user interactions and communicates with the backend via API calls.
- **Backend (Server):** A Node.js server using the Express.js framework. It serves as the central orchestrator, managing API requests, building intelligent prompts, and interacting with the database and external services.
- **Data Layer (Supabase):** A PostgreSQL database managed by Supabase for persistent data storage, including a cache for generated tests, the user feedback log, and the knowledge base.
- **AI Service (Groq):** Leverages the Groq API for high-speed inference of the Llama 3 language model, which powers all generation and refinement tasks.



## **4. Technology Stack**

| Component | Technologies Used |
| --- | --- |
| **Frontend** | `HTML5`, `CSS3`, `Vanilla JavaScript`, `Tesseract.js`, `Prism.js` |
| **Backend** | `Node.js`, `Express.js`, `Axios`, `Multer` (for file uploads) |
| **Database** | `Supabase` (PostgreSQL) |
| **AI Service** | `Groq API` (Llama 3 Model) |

## **5. Setup and Installation**

Follow these steps to get the project running on your local machine.

### **Prerequisites**

- [Node.js](https://nodejs.org/) (which includes npm)
- Git

### Installation Steps

1. Clone the repository: Bash
    
     
    
    `git clone [your-repository-url]
    cd [your-project-folder]`
    
2. Install backend dependencies:Bash
    
    
    
    `cd Backend
    npm install`
    
3. Configure Environment Variables:
    - In the `Backend` folder, create a new file named `.env`.
    - Copy the contents of `env.example` (if it exists) or use the template below and fill in your secret keys.
4. Set up Supabase Database:
    - Ensure you have created the three required tables in your Supabase project:
        1. `test_cases` (for caching)
        2. `feedback_log` (for the learning loop)
        3. `knowledge_base` (for persistent documents)
    - Make sure Row-Level Security (RLS) is **disabled** on these tables for local development only.
5. Run the Backend Server: Bash
    
    
    
    `node index.js`
    
    The server should now be running on `http://localhost:5000`.
    
6. Launch the Frontend:
    - Navigate to the `Frontend` folder and open the `index.html` file in your web browser.

## 6. Configuration (`.env` file)

Your `.env` file in the `Backend` directory must contain the following keys:






````markdown





# Supabase Credentials
SUPABASE_URL="your_supabase_project_url"
SUPABASE_KEY="your_supabase_api_key"

# Groq API Key
GROQ_API_KEY="your_groq_api_key"

# Jira Credentials
JIRA_DOMAIN="your_company.atlassian.net"
JIRA_EMAIL="your_jira_email"
JIRA_TOKEN="your_jira_api_token"
JIRA_PROJECT_KEY="PROJ"
ZEPHYR_TEST_ISSUE_TYPE_ID="12345"
````





## **7. How to Use the Application**

1. **Enter Requirement:** Type your feature requirement in the main text area, import it from Jira, or upload a screenshot.
2. **Select Options:** Use the dropdowns to configure the test type, complexity, count, and output format.
3. **Provide Context (Optional):**
    - Use the "Application Context" card to upload code/docs for the current session.
    - Use the "Knowledge Base" card to permanently upload project standards. Ensure the "Use Knowledge Base" checkbox is ticked if you want to use this context.
4. **Generate:** Click the "Generate Test Cases" button.
5. **Review and Act:**
    - Use the **👍/👎** buttons to provide feedback.
    - Use the **Refine 💬** button to make conversational edits.
    - Use the **Copy**, **Download**, and **Clear** buttons for utility.

## **8. Future Roadmap**

- **CI/CD Integration:** Automatically run generated Playwright tests via GitHub Actions.
- **Advanced Analytics:** A dashboard to visualize user feedback and AI performance.
- **Vector Search for KB:** Enhance the knowledge base with semantic search for better context retrieval from large documents.
- **Expanded Integrations:** Support for other tools like GitHub Issues and Asana.
