
import { useEffect, useRef, useState } from "react";
import "./App.css";

// 1. Predefined FAQ rules
const faqRules = [
  {
    keywords: ["admission", "admissions", "enrollment"],
    answer:
      "Please visit the official college website or contact the admission department for admission details."
  },
  {
    keywords: ["fee", "fees", "tuition"],
    answer:
      "Please check the official college fee structure for accurate information."
  },
  {
    keywords: ["course", "courses", "department"],
    answer:
      "Please check the college website to see the available courses and departments."
  },
  {
    keywords: ["timing", "opening hours", "college time"],
    answer:
      "Please contact your college office to confirm the official timings."
  },
  {
    keywords: ["contact", "phone", "email"],
    answer:
      "Please visit the official college website to find its contact details."
  }
];

// 2. Check whether a predefined rule matches
function getBotAnswer(question) {
  const text = question
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/\b(hello|hi|hey)\b/.test(text)) {
    return "Hello! Welcome to the FAQ Assistant. How can I help you?";
  }

  if (/\b(thanks|thank you)\b/.test(text)) {
    return "You're welcome! Feel free to ask another question.";
  }

  const matchedRule = faqRules.find((rule) =>
    rule.keywords.some((keyword) =>
      text.includes(keyword.toLowerCase())
    )
  );

  // null means that no FAQ rule matched
  return matchedRule ? matchedRule.answer : null;
}

function App() {
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [messages, setMessages] = useState([
    {
      id: "welcome",
      sender: "bot",
      text: "Hello! I'm your FAQ Assistant. Ask me a question to get started."
    }
  ]);

  const bottomRef = useRef(null);

  // Automatically scroll to the latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [messages, isLoading]);

  // 3. Handle the user's question
  async function sendQuestion(questionText) {
    const cleanQuestion = questionText.trim();

    if (!cleanQuestion || isLoading) {
      return;
    }

    const userId = `user-${Date.now()}`;
    const botId = `bot-${Date.now()}`;

    // Add the user's question to the chat
    setMessages((current) => [
      ...current,
      {
        id: userId,
        sender: "user",
        text: cleanQuestion
      }
    ]);

    setQuestion("");

    // FIRST: check predefined FAQ rules
    const ruleAnswer = getBotAnswer(cleanQuestion);

    if (ruleAnswer !== null) {
      // If a rule matches, return its answer immediately
      setMessages((current) => [
        ...current,
        {
          id: botId,
          sender: "bot",
          text: ruleAnswer
        }
      ]);

      return;
    }

    // SECOND: use AI if no rule matches
    setIsLoading(true);

    // Add a placeholder for the incoming AI answer
    setMessages((current) => [
      ...current,
      {
        id: botId,
        sender: "bot",
        text: "Thinking..."
      }
    ]);

    let answer = "";

    // Update only this AI message as text arrives
    function updateBotMessage(text) {
      setMessages((current) =>
        current.map((message) =>
          message.id === botId
            ? { ...message, text }
            : message
        )
      );
    }

    try {
      const response = await fetch(
        "http://localhost:3000/api/chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            question: cleanQuestion
          })
        }
      );

      // Handle backend errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        throw new Error(
          errorData.error || "The AI request failed."
        );
      }

      if (!response.body) {
        throw new Error("The server returned no response stream.");
      }

      // Read the streamed plain-text response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        // Decode each incoming piece of text
        answer += decoder.decode(value, {
          stream: true
        });

        // Display the answer as it arrives
        if (answer) {
          updateBotMessage(answer);
        }
      }

      // Decode any remaining text
      answer += decoder.decode();

      if (!answer.trim()) {
        throw new Error("The AI returned an empty answer.");
      }

      updateBotMessage(answer.trim());

      console.log("AI answer displayed successfully.");

    } catch (error) {
      console.error("Chatbot error:", error);

      updateBotMessage(
        "Sorry, I couldn't connect to the AI. Please check that Ollama and your backend server are running."
      );

    } finally {
      setIsLoading(false);
    }
  }

  // Handle the Send button and Enter key
  function handleSubmit(event) {
    event.preventDefault();
    sendQuestion(question);
  }

  // Start a new conversation
  function newChat() {
    if (isLoading) {
      return;
    }

    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: "bot",
        text: "Hello! I'm your FAQ Assistant. Ask me a question to get started."
      }
    ]);

    setQuestion("");
  }

  const suggestions = [
    "What is the admission process?",
    "What are the fees?",
    "What courses are available?",
    "Explain JavaScript in simple words."
  ];

  return (
    <main className="page">
      <section className="chat-shell">

        {/* Header */}
        <header className="chat-header">
          <div className="brand">
            <div className="bot-logo">🤖</div>

            <div>
              <h1>FAQ Assistant</h1>
              <p>Rule-Based + Local AI Chatbot</p>
            </div>
          </div>

          <button
            className="new-chat-btn"
            type="button"
            onClick={newChat}
            disabled={isLoading}
          >
            + New Chat
          </button>
        </header>

        {/* Chat area */}
        <div className="chat-body">
          <div className="welcome">
            <h2>How can I help you today?</h2>
            <p>
              Ask about college FAQs or ask a general question.
            </p>
          </div>

          <div className="messages">
            {messages.map((message) => (
              <div
                className={`message-row ${message.sender}`}
                key={message.id}
              >
                {message.sender === "bot" && (
                  <div className="message-avatar">🤖</div>
                )}

                <div className="message-bubble">
                  <span className="sender-name">
                    {message.sender === "bot"
                      ? "FAQ Assistant"
                      : "You"}
                  </span>

                  <p>{message.text}</p>
                </div>

                {message.sender === "user" && (
                  <div className="message-avatar user-avatar">
                    👤
                  </div>
                )}
              </div>
            ))}

            <div ref={bottomRef} />
          </div>

          {/* Suggested questions */}
          {messages.length === 1 && (
            <div className="suggestions">
              <p>Try asking:</p>

              {suggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  disabled={isLoading}
                  onClick={() => sendQuestion(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Input area */}
        <footer className="chat-footer">
          <form
            className="input-form"
            onSubmit={handleSubmit}
          >
            <input
              type="text"
              value={question}
              onChange={(event) =>
                setQuestion(event.target.value)
              }
              placeholder="Ask your question..."
              aria-label="Type your question"
              disabled={isLoading}
            />

            <button
              className="send-btn"
              type="submit"
              aria-label="Send message"
              disabled={isLoading || !question.trim()}
            >
              ➤
            </button>
          </form>

          <p className="footer-note">
            FAQ rules answer matching questions. Local AI handles other questions.
          </p>
        </footer>

      </section>
    </main>
  );
}

export default App;
