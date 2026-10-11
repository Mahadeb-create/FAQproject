
const express = require("express");
const cors = require("cors");

const app = express();

const PORT = 3000;
const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const MODEL_NAME = "qwen3:4b-instruct";

// 1. Frontend connection
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173"
    ]
  })
);

app.use(express.json());

// 2. Log incoming requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// 3. Check backend connection
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Backend is working!",
    model: MODEL_NAME
  });
});

// 4. FAQ chatbot AI endpoint
app.post("/api/chat", async (req, res) => {
  const { question } = req.body || {};

  if (typeof question !== "string" || !question.trim()) {
    return res.status(400).json({
      error: "Please enter a question."
    });
  }

  const cleanQuestion = question.trim();
  const startTime = Date.now();

  // Detect questions requesting 15-mark exam answers
  const is15MarkQuestion =
    /\b15\s*[- ]?\s*marks?\b/i.test(cleanQuestion);

  const systemPrompt = is15MarkQuestion
    ? `
You are a helpful college teacher.

Write a detailed college examination answer suitable for 15 marks.

Use this structure when appropriate:
1. Title
2. Introduction
3. Definitions
4. Detailed explanation with headings
5. Important features
6. Examples
7. Comparison table if relevant
8. Applications, advantages and limitations
9. Conclusion

Use simple English and explain each topic separately.
Aim for approximately 700 to 1000 words when appropriate.
Do not give only a short summary.
Avoid unnecessary repetition.
`
    : `
You are a helpful educational assistant.
Explain concepts in simple English.
Give clear explanations and useful examples.
When the user asks for detail, provide a detailed answer.
For ordinary questions, answer directly.
`;

  console.log("Question:", cleanQuestion);
  console.log("15-mark mode:", is15MarkQuestion);

  let reader;
  let clientDisconnected = false;

  try {
    console.log("Connecting to Ollama...");

    // 5. Send the question to Ollama
    const ollamaResponse = await fetch(OLLAMA_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        model: MODEL_NAME,

        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: cleanQuestion
          }
        ],

        stream: true,
        keep_alive: "30m",

        options: {
          num_predict: is15MarkQuestion ? 2400 : 700,
          num_ctx: 4096
        }
      }),

      signal: AbortSignal.timeout(300000)
    });

    // 6. Display Ollama's actual error
    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text();

      console.error(
        "Ollama error:",
        ollamaResponse.status,
        errorText
      );

      return res.status(502).json({
        error: `Ollama returned HTTP ${ollamaResponse.status}: ${errorText}`
      });
    }

    if (!ollamaResponse.body) {
      throw new Error("Ollama returned an empty response.");
    }

    console.log(
      `Ollama connected in ${Date.now() - startTime} ms`
    );

    // 7. Stream plain text to React
    res.status(200);
    res.setHeader(
      "Content-Type",
      "text/plain; charset=utf-8"
    );
    res.setHeader(
      "Cache-Control",
      "no-cache, no-transform"
    );
    res.setHeader("X-Accel-Buffering", "no");

    res.flushHeaders();

    res.on("close", () => {
      if (!res.writableEnded) {
        clientDisconnected = true;
        console.log("Frontend disconnected.");
        reader?.cancel().catch(() => {});
      }
    });

    reader = ollamaResponse.body.getReader();

    const decoder = new TextDecoder();
    let buffer = "";
    let firstTokenReceived = false;

    // Process one JSON line from Ollama
    function processLine(line) {
      if (!line.trim()) return;

      const chunk = JSON.parse(line);

      if (chunk.error) {
        throw new Error(chunk.error);
      }

      const text = chunk.message?.content;

      if (text && !clientDisconnected) {
        if (!firstTokenReceived) {
          firstTokenReceived = true;

          console.log(
            `First text received in ${Date.now() - startTime} ms`
          );
        }

        res.write(text);
      }
    }

    // 8. Read the streaming response
    while (true) {
      const { value, done } = await reader.read();

      if (done || clientDisconnected) break;

      buffer += decoder.decode(value, {
        stream: true
      });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        processLine(line);
      }
    }

    // Handle the final unfinished line
    buffer += decoder.decode();

    if (!clientDisconnected && buffer.trim()) {
      processLine(buffer);
    }

    if (!res.writableEnded) {
      res.end();
    }

    console.log(
      `AI completed in ${Date.now() - startTime} ms`
    );

  } catch (error) {
    console.error("Chatbot error:", error.message);

    if (clientDisconnected) {
      return;
    }

    if (!res.headersSent) {
      res.status(500).json({
        error: error.name === "TimeoutError"
          ? "Ollama took too long to respond. Try again."
          : `AI connection failed: ${error.message}`
      });
    } else if (!res.writableEnded) {
      // The text stream has already started.
      res.end();
    }
  }
});

// 9. Start backend
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`AI model: ${MODEL_NAME}`);
});
