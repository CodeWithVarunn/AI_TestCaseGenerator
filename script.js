let lastOutput = ""; // Store output as backup

// ✅ Extract text from screenshot
document.getElementById("extractBtn").addEventListener("click", async () => {
  const file = document.getElementById("imageInput").files[0];
  const outputDiv = document.getElementById("output");

  if (!file) {
    alert("❗ Please upload a screenshot image first.");
    return;
  }

  outputDiv.innerText = "🔍 Extracting text from image...";

  try {
    const result = await Tesseract.recognize(file, "eng");
    const extractedText = result.data.text.trim();

    if (extractedText) {
      document.getElementById("requirement").value = extractedText;
      outputDiv.innerText =
        "✅ Text extracted. You can now generate the test case.";

      // Save extracted text so it's not lost
      sessionStorage.setItem("lastInput", extractedText);
    } else {
      outputDiv.innerText = "⚠️ No readable text found in the image.";
    }
  } catch (err) {
    console.error("❌ OCR Error:", err);
    outputDiv.innerText = "❌ Failed to extract text.";
  }
});

// ✅ Generate test case
document.getElementById("generateBtn").addEventListener("click", async (e) => {
  e.preventDefault();

  const inputText = document.getElementById("requirement").value.trim();
  const outputDiv = document.getElementById("output");

  if (!inputText) {
    outputDiv.innerText = "❗ Please enter a requirement.";
    return;
  }

  // Save input to session
  sessionStorage.setItem("lastInput", inputText);

  outputDiv.innerText = "⏳ Generating test case...";

  try {
    const res = await fetch("http://localhost:5000/generate-testcase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputText }),
    });

    const data = await res.json();
    const finalOutput = data?.testCase?.raw || "⚠️ No test case generated.";

    outputDiv.innerText = finalOutput;
    lastOutput = finalOutput;
    sessionStorage.setItem("lastOutput", finalOutput);
  } catch (err) {
    console.error("❌ Error:", err);
    outputDiv.innerText = "❌ Failed to generate test case.";
  }
});

// ✅ Restore textarea and output on page load
window.addEventListener("DOMContentLoaded", () => {
  const savedInput = sessionStorage.getItem("lastInput");
  const savedOutput = sessionStorage.getItem("lastOutput");

  if (savedInput) {
    document.getElementById("requirement").value = savedInput;
  }
  if (savedOutput) {
    document.getElementById("output").innerText = savedOutput;
    lastOutput = savedOutput;
  }
});

// ✅ Watchdog: Restore if output disappears
setInterval(() => {
  const outputDiv = document.getElementById("output");
  if (!outputDiv.innerText.trim() && lastOutput) {
    outputDiv.innerText = lastOutput;
  }
}, 1000);
