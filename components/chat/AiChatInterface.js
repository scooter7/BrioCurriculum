// File: components/chat/AiChatInterface.js
import React, { useState, useEffect, useRef } from 'react';

// Styles (ensure these are complete or use CSS Modules)
const chatInterfaceStyle = {
  backgroundColor: '#FFFFFF',
  padding: '20px',
  borderRadius: 'var(--border-radius)',
  boxShadow: 'var(--card-shadow)',
  marginTop: '16px',
  display: 'flex',
  flexDirection: 'column',
  height: 'calc(100vh - var(--header-height) - 200px)',
  minHeight: '400px',
};

const chatHeaderStyle = {
  fontSize: '18px',
  fontWeight: '500',
  marginBottom: '16px',
  color: 'var(--text-headings)',
  flexShrink: 0,
};

const chatWindowStyle = {
  backgroundColor: 'var(--bg-light)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--border-radius)',
  flexGrow: 1,
  overflowY: 'auto',
  padding: '16px',
  marginBottom: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const messageStyle = {
  padding: '8px 14px',
  borderRadius: 'var(--border-radius)',
  maxWidth: '80%',
  fontSize: '14px',
  lineHeight: '1.6',
  wordWrap: 'break-word',
};

const aiMessageStyle = {
  ...messageStyle,
  backgroundColor: 'var(--border-color)',
  color: 'var(--text-primary)',
  alignSelf: 'flex-start',
  borderTopLeftRadius: '0',
};

const userMessageStyle = {
  ...messageStyle,
  backgroundColor: 'var(--primary-color)',
  color: 'var(--text-on-primary)',
  alignSelf: 'flex-end',
  borderTopRightRadius: '0',
};

const timestampStyle = {
  fontSize: '10px',
  color: 'var(--text-secondary)',
  display: 'block',
  textAlign: 'right',
  marginTop: '4px',
  opacity: 0.7,
};

const aiTimestampStyle = {
  ...timestampStyle,
  color: '#666',
};

const chatInputAreaStyle = {
  display: 'flex',
  gap: '10px',
  alignItems: 'center',
  flexShrink: 0,
};

const errorTextStyle = {
  color: 'red',
  fontSize: '13px',
  padding: '5px 0',
  textAlign: 'center',
};

const AiChatInterface = ({ selectedCurriculum }) => {
  console.log("AiChatInterface rendered. Selected Curriculum:", selectedCurriculum);

  const [messages, setMessages] = useState([
    { role: 'model', parts: [{text: "Hello! I'm your curriculum AI assistant. How can I help you analyze or improve your curriculum today?"}], timestamp: new Date() }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMounted, setHasMounted] = useState(false); // State to track client-side mount

  const chatWindowRef = useRef(null);

  useEffect(() => {
    setHasMounted(true); // Set to true after component mounts on the client
  }, []);

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages]);

  const handleInputChange = (event) => {
    setInputValue(event.target.value);
  };

  const handleSendMessage = async (event) => {
    console.log("handleSendMessage called");
    if (event) event.preventDefault();

    const trimmedMessage = inputValue.trim();
    console.log("Trimmed message:", trimmedMessage);

    if (!trimmedMessage) {
      console.log("Message is empty, not sending.");
      return;
    }

    const newUserMessage = { role: 'user', parts: [{text: trimmedMessage}], timestamp: new Date() };
    
    const historyForAPI = messages.map(msg => ({
      role: msg.role,
      parts: msg.parts,
    }));
    
    setMessages(prevMessages => [...prevMessages, newUserMessage]);
    setInputValue('');
    setIsLoading(true);
    setError(null);
    console.log("Set loading to true, cleared input.");

    let curriculumContext = "";
    if (selectedCurriculum) {
      curriculumContext = `Curriculum Name: ${selectedCurriculum.name}.`;
      if (selectedCurriculum.schoolTag) {
        curriculumContext += ` School: ${selectedCurriculum.schoolTag}.`;
      }
      if (selectedCurriculum.analysisResults && Object.keys(selectedCurriculum.analysisResults).length > 0) {
         curriculumContext += ` Current analysis summary: ${selectedCurriculum.analysisResults.overallStatusText || 'Not yet fully analyzed'}.`;
      }
    }
    console.log("Curriculum context for API:", curriculumContext);
    console.log("Attempting to fetch from /api/ai/chat");

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: trimmedMessage,
          history: historyForAPI,
          curriculumContext: curriculumContext,
        }),
      });
      console.log("Fetch response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to parse error response" }));
        console.error("API Error Data:", errorData);
        throw new Error(errorData.error || `API Error: ${response.status}`);
      }

      const data = await response.json();
      console.log("API Success Data:", data);
      const aiReply = { role: 'model', parts: [{text: data.reply}], timestamp: new Date() };
      setMessages(prevMessages => [...prevMessages, aiReply]);

    } catch (err) {
      console.error("Failed to send message or get AI reply (in catch block):", err);
      setError(err.message);
      const errorMessage = { role: 'model', parts: [{text: `Sorry, I encountered an error: ${err.message}`}], timestamp: new Date(), isError: true };
      setMessages(prevMessages => [...prevMessages, errorMessage]);
    } finally {
      setIsLoading(false);
      console.log("Set loading to false (in finally block).");
    }
  };

  console.log("Current inputValue:", inputValue);
  console.log("Current isLoading state:", isLoading);


  return (
    <section style={chatInterfaceStyle} aria-labelledby="chat-interface-title">
      <h2 id="chat-interface-title" style={chatHeaderStyle}>AI Insights & Recommendations</h2>
      
      <div style={chatWindowStyle} ref={chatWindowRef}>
        {messages.map((msg, index) => (
          <div
            key={index}
            style={msg.role === 'user' ? userMessageStyle : (msg.isError ? {...aiMessageStyle, backgroundColor: '#ffe0e0', color: 'red'} : aiMessageStyle)}
          >
            <p style={{margin: 0}}>{msg.parts[0]?.text || "..."}</p>
            {/* Only render timestamp on client after mount to avoid hydration mismatch */}
            {hasMounted && (
              <span style={msg.role === 'user' ? timestampStyle : aiTimestampStyle}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        ))}
        {isLoading && (
          <div style={{ ...aiMessageStyle, alignSelf: 'flex-start', opacity: 0.7 }}>
            <p style={{margin: 0}}><i>AI is thinking...</i></p>
          </div>
        )}
      </div>

      {error && <p style={errorTextStyle}>{error}</p>}

      <form onSubmit={handleSendMessage} style={chatInputAreaStyle}>
        <input
          type="text"
          className="input-field"
          value={inputValue}
          onChange={handleInputChange}
          placeholder={isLoading ? "AI is replying..." : "Ask about the curriculum or analysis..."}
          disabled={isLoading}
          style={{ flexGrow: 1 }}
          aria-label="Chat message input"
        />
        <button
          type="submit"
          className="btn btn-primary send-button"
          disabled={isLoading || !inputValue.trim()}
        >
          <span className="icon" style={{marginRight: (isLoading || !inputValue.trim()) ? '0' : '5px'}}>➢</span>
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </form>
    </section>
  );
};

export default AiChatInterface;
