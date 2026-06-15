import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './ScribeWidget.css';

export default function ScribeWidget({
  application = 'nmail',
  apiUrl = 'http://localhost:8000/api',
  userId = 'demoUser',
  onNavigate = null
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputVal, setInputVal] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  
  // States for input history navigation (Up/Down arrows)
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [inputDraft, setInputDraft] = useState('');
  
  const chatEndRef = useRef(null);
  const sessionKey = `scribe_session_${application}`;

  // 1. Get or create sessionId in localStorage
  const [sessionId] = useState(() => {
    let sid = localStorage.getItem(sessionKey);
    if (!sid) {
      sid = 'sid_' + Math.random().toString(36).substring(2, 11);
      localStorage.setItem(sessionKey, sid);
    }
    return sid;
  });

  // 1.5. Fetch session history on load
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await axios.get(`${apiUrl}/session`, {
          params: { application, sessionId, userId }
        });
        if (Array.isArray(res.data)) {
          setMessages(res.data);
        }
      } catch (err) {
        console.error('Error fetching session history:', err);
      }
    };
    fetchHistory();
  }, [application, sessionId, userId, apiUrl]);

  // 2. Scroll to bottom of message list on updates
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isOpen]);

  // 3. Check backend health periodically
  useEffect(() => {
    const checkHealth = async () => {
      try {
        await axios.get(`${apiUrl}/health`);
        setIsOnline(true);
      } catch (e) {
        setIsOnline(false);
      }
    };

    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [apiUrl]);

  // Key press handler for Enter and ArrowUp / ArrowDown navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
      setHistoryIndex(-1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); // prevent cursor moving to start of input
      const userMessages = messages.filter(m => m.sender === 'user');
      if (userMessages.length === 0) return;

      let nextIndex = historyIndex;
      if (historyIndex === -1) {
        // Save current draft
        setInputDraft(inputVal);
        nextIndex = userMessages.length - 1;
      } else if (historyIndex > 0) {
        nextIndex = historyIndex - 1;
      }

      setHistoryIndex(nextIndex);
      setInputVal(userMessages[nextIndex].message);
    } else if (e.key === 'ArrowDown') {
      const userMessages = messages.filter(m => m.sender === 'user');
      if (historyIndex === -1) return;

      let nextIndex = historyIndex + 1;
      if (nextIndex >= userMessages.length) {
        setHistoryIndex(-1);
        setInputVal(inputDraft);
      } else {
        setHistoryIndex(nextIndex);
        setInputVal(userMessages[nextIndex].message);
      }
    }
  };

  // 4. Send message handler
  const handleSendMessage = async (textToSend) => {
    const text = textToSend || inputVal;
    if (!text.trim() || isLoading) return;

    setHistoryIndex(-1);

    if (!textToSend) {
      setInputVal('');
    }

    // Append user message
    const userMsg = { sender: 'user', message: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await axios.post(`${apiUrl}/chat`, {
        application,
        sessionId,
        question: text,
        userId
      });

      const assistantMsg = {
        sender: 'assistant',
        message: res.data.answer,
        url: res.data.url,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error('Scribe Chat Error:', err);
      const errMsg = {
        sender: 'assistant',
        message: '⚠️ Sorry, I encountered an error. Please verify the backend service is running.',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Reset session chat history
  const handleResetSession = async () => {
    try {
      await axios.delete(`${apiUrl}/session`, {
        data: { application, sessionId, userId }
      });
    } catch (err) {
      console.error('Error resetting session:', err);
    }
    setMessages([]);
    setInputVal('');
  };

  const handleSuggestionClick = (question) => {
    handleSendMessage(question);
  };

  const handleNavigation = (url) => {
    if (onNavigate) {
      onNavigate(url);
    } else {
      console.log(`Navigating to: ${url}`);
      window.location.hash = url; // fallback to hash navigation
    }
  };

  // Helper: Simple Markdown compiler
  const parseMarkdown = (text) => {
    if (!text) return '';
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Headings: ### text
    html = html.replace(/^###\s+(.*)$/gmi, '<h3>$1</h3>');

    // Bold: **text**
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Bullet points: - text or * text
    html = html.replace(/^\s*[-*]\s+(.*)$/gmi, '<li>$1</li>');
    // Wrap consecutive list items
    html = html.replace(/(<li>.*?<\/li>)+/g, '<ul>$&</ul>');

    // Newlines to paragraphs
    const paragraphs = html.split('\n\n');
    html = paragraphs.map(p => {
      if (p.startsWith('<h3>') || p.startsWith('<ul>') || p.startsWith('<li>')) {
        return p;
      }
      return `<p>${p.replace(/\n/g, '<br/>')}</p>`;
    }).join('');

    return { __html: html };
  };

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <div className="scribe-float-btn" onClick={() => setIsOpen(true)}>
          {/* Custom chat icon SVG */}
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'white' }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <span className={`scribe-status-dot ${isOnline ? 'online' : 'offline'}`} />
        </div>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className={`scribe-window ${isMinimized ? 'minimized' : ''}`}>
          {/* Header */}
          <div className="scribe-header">
            <div className="scribe-header-title">
              <span className={`scribe-header-status ${isOnline ? '' : 'offline'}`} />
              <h5>Scribe</h5>
            </div>
            
            <div className="scribe-header-actions">
              {/* Reset session button */}
              <button className="scribe-header-btn" title="Clear conversation" onClick={handleResetSession}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>

              {/* Minimize button */}
              <button className="scribe-header-btn" title="Minimize" onClick={() => setIsMinimized(!isMinimized)}>
                {isMinimized ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <polyline points="9 21 3 21 3 15"></polyline>
                    <line x1="21" y1="3" x2="14" y2="10"></line>
                    <line x1="3" y1="21" x2="10" y2="14"></line>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                )}
              </button>

              {/* Close button */}
              <button className="scribe-header-btn" title="Close" onClick={() => setIsOpen(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>

          {/* Chat Body */}
          {!isMinimized && (
            <>
              <div className="scribe-chat-body">
                {messages.length === 0 ? (
                  /* Welcome Screen */
                  <div className="scribe-welcome">
                    <div className="scribe-welcome-icon">👋</div>
                    <h4>I'm Scribe</h4>
                    <p>I'm here to help you navigate {application === 'nmail' ? 'Nmail' : 'EmaCloud'} and find what you need.</p>
                    <div className="scribe-welcome-suggestions">
                      <div className="text-muted text-start mb-2" style={{ fontSize: '12px', fontWeight: 'bold' }}>You can ask:</div>
                      
                      {application === 'nmail' ? (
                        <>
                          <button className="scribe-suggestion-chip" onClick={() => handleSuggestionClick('Where is Watchdog?')}>
                            🔍 Where is Watchdog?
                          </button>
                          <button className="scribe-suggestion-chip" onClick={() => handleSuggestionClick('How do I create a domain?')}>
                            🌐 How do I create a domain?
                          </button>
                          <button className="scribe-suggestion-chip" onClick={() => handleSuggestionClick('Where is user management?')}>
                            👤 Where is user management?
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="scribe-suggestion-chip" onClick={() => handleSuggestionClick('Where is email campaigns?')}>
                            📧 Where is email campaigns?
                          </button>
                          <button className="scribe-suggestion-chip" onClick={() => handleSuggestionClick('How to see open rate and clicks reports?')}>
                            📊 How to see open rate reports?
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Messages List */
                  messages.map((msg, index) => (
                    <div key={index} className={`scribe-message-wrapper ${msg.sender}`}>
                      <div
                        className="scribe-message-bubble"
                        dangerouslySetInnerHTML={parseMarkdown(msg.message)}
                      />
                      
                      {/* Render Navigation button if Scribe returns a URL */}
                      {msg.sender === 'assistant' && msg.url && (
                        <button className="scribe-nav-btn" onClick={() => handleNavigation(msg.url)}>
                          Open Page
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                          </svg>
                        </button>
                      )}
                    </div>
                  ))
                )}

                {/* Loading indicator */}
                {isLoading && (
                  <div className="scribe-typing">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <div className="scribe-input-container">
                <div className="scribe-input-wrapper">
                  <input
                    type="text"
                    className="scribe-input-field"
                    placeholder="Ask a question..."
                    value={inputVal}
                    onChange={(e) => {
                      setInputVal(e.target.value);
                      setHistoryIndex(-1); // Reset index on typing
                    }}
                    onKeyDown={handleKeyDown}
                    disabled={!isOnline}
                  />
                </div>
                <button
                  className="scribe-send-btn"
                  onClick={() => handleSendMessage()}
                  disabled={!isOnline || !inputVal.trim() || isLoading}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
