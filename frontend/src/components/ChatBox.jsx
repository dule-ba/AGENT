import React, { useState, useEffect, useRef } from 'react';
import { sendChatMessage, executeWorkflow, getCurrentSessionId, resetSession } from '../api';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup';

const ChatBox = ({ onResultChange, onWorkflowResult }) => {
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('executor');
  const [selectedModel, setSelectedModel] = useState('default');
  const [selectedMcpServer, setSelectedMcpServer] = useState('anthropic');
  const [temperature, setTemperature] = useState(0.7);
  const [automaticWorkflow, setAutomaticWorkflow] = useState(true);
  const [sessionInfo, setSessionInfo] = useState({ active: false, id: null });
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [showMcpDropdown, setShowMcpDropdown] = useState(false);
  const messageEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const mcpDropdownRef = useRef(null);
  const sending = useRef(false);
  const error = useRef(null);

  // Provjeri aktivnu sesiju prilikom učitavanja
  useEffect(() => {
    const currentSession = getCurrentSessionId();
    if (currentSession) {
      setSessionInfo({ active: true, id: currentSession });
    }
    
    // Uvijek koristi "anthropic" kao MCP server jer backend podržava samo taj
    localStorage.setItem('mcp_preferred_server', 'anthropic');
    setSelectedMcpServer('anthropic');
    
    const savedModel = localStorage.getItem('mcp_preferred_model');
    if (savedModel) {
      setSelectedModel(savedModel);
    }
    
    const savedTemperature = localStorage.getItem('mcp_preferred_temperature');
    if (savedTemperature) {
      setTemperature(parseFloat(savedTemperature));
    }
    
    const savedAutoWorkflow = localStorage.getItem('mcp_auto_workflow');
    if (savedAutoWorkflow !== null) {
      setAutomaticWorkflow(savedAutoWorkflow === 'true');
    }
    
    const savedAgent = localStorage.getItem('mcp_preferred_agent');
    if (savedAgent) {
      setSelectedAgent(savedAgent);
    }
  }, []);

  // Zatvori MCP dropdown kad se klikne negdje drugdje
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (mcpDropdownRef.current && !mcpDropdownRef.current.contains(event.target)) {
        setShowMcpDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Scroll to bottom whenever chat history changes
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  useEffect(() => {
    // Kada se povijest promijeni, pomakni se na dno chata
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    
    // Primjeni Prism syntax highlighting na sve blokove koda
    Prism.highlightAll();
  }, [chatHistory]);

  const handleSend = async () => {
    if (!message.trim() && uploadedFiles.length === 0 && uploadedImages.length === 0) return;

    // Dodaj poruku korisnika u povijest
    const userMessage = { 
      type: 'user',
      text: message,
      timestamp: new Date().toISOString()
    };
    
    const newHistory = [...chatHistory, userMessage];
    setChatHistory(newHistory);
    setIsLoading(true);
    sending.current = true;
    error.current = null;

    try {
      let result;
      
      if (automaticWorkflow) {
        // Koristi workflow način za slanje poruke
        console.log("Izvršavanje workflow-a...");
        result = await executeWorkflow(message, {
          agent: selectedAgent,
          mcpServer: selectedMcpServer,
          auto_model_selection: selectedModel === "default"
        });
        
        // Obavijesti glavnu aplikaciju o rezultatu
        if (onWorkflowResult) {
          onWorkflowResult(result);
        }
        
        // Dodaj odgovor u chat povijest
        const assistantResponse = {
          type: 'assistant',
          text: result.workflowResult?.response ||
                result.codeResult?.response || 
                (result.codeResult ? result.codeResult.text : '') || 
                result.message ||
                "Workflow završen",
          timestamp: new Date().toISOString(),
          workflow: true,
          agent: result.phase === 'debug_response' ? 'debugger' : selectedAgent,
          responseType: result.type || 'code',
          workflowData: result
        };
        
        setChatHistory([...newHistory, assistantResponse]);
      } else {
        // Standardni način - samo pošalji poruku odabranom agentu
        result = await sendChatMessage(message, selectedAgent, {
          mcpServer: selectedMcpServer,
          auto_model_selection: selectedModel === "default"
        });
        
        // Obavijesti glavnu aplikaciju o rezultatu
        if (onResultChange) {
          onResultChange(result);
        }
        
        // Dodaj odgovor u chat povijest
        const assistantResponse = {
          type: 'assistant',
          text: result.response,
          timestamp: new Date().toISOString(),
          agent: selectedAgent,
          modelInfo: result.selected_model ? `${result.selected_model} (${result.selected_temperature})` : undefined
        };
        
        const updatedHistory = [...newHistory, assistantResponse];
        setChatHistory(updatedHistory);
        
        // Spremi povijest u localStorage za perzistenciju
        const sessionId = localStorage.getItem('current_session_id');
        if (sessionId) {
          localStorage.setItem(`chat_history_${sessionId}`, JSON.stringify(updatedHistory));
        }
      }
      
      setMessage('');
    } catch (error) {
      console.error("Error sending message:", error);
      error.current = error.message;
    } finally {
      setIsLoading(false);
      sending.current = false;
      if (fileInputRef.current) {
        fileInputRef.current.value = null;
      }
      if (imageInputRef.current) {
        imageInputRef.current.value = null;
      }
      if (messageEndRef.current) {
        messageEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  // Restartaj sesiju - briše history i resetira session_id
  const handleResetSession = () => {
    resetSession();
    setChatHistory([]);
    setSessionInfo({ active: false, id: null });
    setUploadedFiles([]);
    setUploadedImages([]);
    if (onResultChange) {
      onResultChange(null);
    }
    if (onWorkflowResult) {
      onWorkflowResult(null);
    }
  };
  
  // Handler za upload fajlova
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    setUploadedFiles(prevFiles => [...prevFiles, ...files]);
    e.target.value = null;
  };
  
  // Handler za upload slika
  const handleImageUpload = (e) => {
    const imageFiles = Array.from(e.target.files);
    
    // Kreiraj preview URL-ove za slike
    const newImages = imageFiles.map(file => ({
      file,
      preview: URL.createObjectURL(file)
    }));
    
    setUploadedImages(prev => [...prev, ...newImages]);
    e.target.value = null;
  };
  
  // Handler za uklanjanje fajla
  const handleRemoveFile = (index) => {
    setUploadedFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
  };
  
  // Handler za uklanjanje slike
  const handleRemoveImage = (index) => {
    setUploadedImages(prevImages => {
      // Revoke object URL to avoid memory leaks
      URL.revokeObjectURL(prevImages[index].preview);
      return prevImages.filter((_, i) => i !== index);
    });
  };
  
  // Trigger file input click
  const triggerFileUpload = () => {
    fileInputRef.current.click();
  };
  
  // Trigger image input click
  const triggerImageUpload = () => {
    imageInputRef.current.click();
  };

  // Toggle MCP dropdown
  const toggleMcpDropdown = () => {
    setShowMcpDropdown(!showMcpDropdown);
  };

  // Get MCP server icon
  const getMcpServerIcon = () => {
    switch(selectedMcpServer) {
      case 'anthropic':
        return (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19.7 3h-2l-5.5 13.3L6.3 3H4.2l7 17h2l7-17H19.7z" fill="currentColor"/>
          </svg>
        );
      case 'openai':
        return (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15.5 8.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0zM12 10a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-3.5-1.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0zM10.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0zm8-3a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" fill="currentColor"/>
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );
      case 'google':
        return (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M17.5 7.5h-11v8h11V7.5z" fill="currentColor"/>
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 16v-4m0-4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );
    }
  };

  // Handler za promjenu MCP servera
  const handleMcpServerChange = (server) => {
    // Uvijek koristimo "anthropic" bez obzira na odabir
    const forcedServer = 'anthropic';
    setSelectedMcpServer(forcedServer);
    localStorage.setItem('mcp_preferred_server', forcedServer);
    setShowMcpDropdown(false);
    console.log('MCP server postavljen na:', forcedServer, '(korisnički odabir ignoriran)');
  };
  
  // Handler za promjenu modela
  const handleModelChange = (e) => {
    const model = e.target.value;
    setSelectedModel(model);
    localStorage.setItem('mcp_preferred_model', model);
  };
  
  // Handler za promjenu temperature
  const handleTemperatureChange = (e) => {
    const temp = parseFloat(e.target.value);
    setTemperature(temp);
    localStorage.setItem('mcp_preferred_temperature', temp.toString());
  };
  
  // Handler za promjenu automatic workflow
  const handleAutomaticWorkflowChange = () => {
    const newValue = !automaticWorkflow;
    setAutomaticWorkflow(newValue);
    localStorage.setItem('mcp_auto_workflow', newValue.toString());
  };
  
  // Handler za promjenu agenta
  const handleAgentChange = (e) => {
    const agent = e.target.value;
    setSelectedAgent(agent);
    localStorage.setItem('mcp_preferred_agent', agent);
  };

  const handleServerChange = (e) => {
    const newServer = e.target.value;
    setSelectedMcpServer(newServer);
    
    // Postavi defaultni model zasnovan na serveru
    if (newServer === "openai") {
      setSelectedModel("gpt-4o");
    } else if (newServer === "anthropic") {
      setSelectedModel("claude-3-opus-20240229");
    } else if (newServer === "google") {
      setSelectedModel("gemini-pro");
    } else {
      setSelectedModel("default");
    }
  };

  // Funkcija za formatiranje koda s Prism.js
  const formatCodeBlocks = (text) => {
    if (!text) return '';
    
    // Zamijenite kod blokove s formatiranim kodom
    const replacedText = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
      const lang = language || 'javascript';
      return `<pre><code class="language-${lang}">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
    });
    
    return replacedText;
  };

  // Funkcija za ekstrakciju koda iz odgovora agenta
  const extractCodeFromMessage = (message) => {
    if (!message) return null;
    
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const codeBlocks = [];
    let match;
    
    while ((match = codeBlockRegex.exec(message)) !== null) {
      codeBlocks.push({
        language: match[1] || 'python',
        code: match[2].trim()
      });
    }
    
    return codeBlocks.length > 0 ? codeBlocks[codeBlocks.length - 1] : null;
  };

  // Funkcija za izvlačenje terminal komandi
  const extractTerminalCommands = (message) => {
    if (!message) return [];
    
    const commandRegex = /`\$(.*?)`|`(.*?)`/g;
    const commands = [];
    let match;
    
    while ((match = commandRegex.exec(message)) !== null) {
      const command = match[1] || match[2];
      if (command && !command.includes('\n')) {
        commands.push(command.trim());
      }
    }
    
    return commands;
  };

  // Poboljšana funkcija za procesiranje odgovora agenta
  const handleAgentResponse = (response) => {
    // Procesiramo odgovor
    setChatHistory(prev => [...prev, { 
      role: 'assistant', 
      content: response.response, 
      timestamp: new Date().toISOString(),
      agent: selectedAgent
    }]);
    
    // Provjerimo ima li koda za editor
    const codeBlock = extractCodeFromMessage(response.response);
    if (codeBlock) {
      // Šalji kod u Monaco Editor
      setEditorContent(codeBlock.code);
      setEditorLanguage(codeBlock.language);
      // Automatski prebaci na Monaco tab
      setActiveTab('monaco');
    }
    
    // Provjerimo ima li terminal komandi
    const commands = extractTerminalCommands(response.response);
    if (commands.length > 0) {
      // Šalji komande u terminal
      setTerminalCommands(prev => [...prev, ...commands]);
      // Prebaci na terminal tab ako nema koda
      if (!codeBlock) {
        setActiveTab('terminal');
      }
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div className="header-left">
          <h3>AI Agent Platforma</h3>
          <button onClick={handleResetSession} className="reset-button">
            Reset Sesije
          </button>
        </div>
        <div className="chat-controls">
          <select 
            value={selectedAgent} 
            onChange={handleAgentChange}
            className="agent-select"
          >
            <option value="executor">Executor Agent</option>
            <option value="code">Code Agent</option>
            <option value="debugger">Debugger Agent</option>
            <option value="planner">Planner Agent</option>
            <option value="data">Data Agent</option>
          </select>
          
          <div className="temperature-control">
            <label>Temp: {temperature}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={temperature}
              onChange={handleTemperatureChange}
              className="temperature-slider"
            />
          </div>
          
          <div className="toggle-container">
            <label>
              <input 
                type="checkbox" 
                checked={selectedModel === "default"} 
                onChange={handleModelChange} 
              />
              Auto odabir
            </label>
            
            <label>
              <input 
                type="checkbox" 
                checked={automaticWorkflow} 
                onChange={handleAutomaticWorkflowChange} 
              />
              Workflow
            </label>
          </div>
        </div>
      </div>
      
      <div className="messages-container">
        {chatHistory.length === 0 ? (
          <div className="empty-chat">
            <p>Započnite razgovor sa AI agentom...</p>
          </div>
        ) : (
          chatHistory.map((msg, index) => (
            <div 
              key={index} 
              className={`message ${msg.type === 'user' ? 'user-message' : 'assistant-message'}`}
            >
              <div className="message-header">
                <span className="message-sender">
                  {msg.type === 'user' ? 'Vi' : msg.agent ? `${msg.agent.charAt(0).toUpperCase() + msg.agent.slice(1)} Agent` : 'Executor'}
                </span>
                <span className="message-time">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
                {msg.modelInfo && (
                  <span className="model-info" title="Korišteni model i temperatura">
                    {msg.modelInfo}
                  </span>
                )}
              </div>
              
              <div 
                className="message-content"
                dangerouslySetInnerHTML={{ 
                  __html: msg.type === 'assistant' 
                    ? formatCodeBlocks(msg.text) 
                    : msg.text 
                }}
              />
              
              {msg.workflow && msg.workflowData && (
                <div className="workflow-info">
                  <span className="workflow-badge">
                    Workflow: {msg.workflowData.status}
                  </span>
                  {msg.workflowData.fixedResult && (
                    <span className="debug-badge">
                      Debug: Uspješno
                    </span>
                  )}
                  </div>
                )}
            </div>
          ))
        )}
        <div ref={messageEndRef} />
      </div>
      
      {error.current && (
        <div className="error-message">
          <p>Greška: {error.current}</p>
        </div>
      )}
      
      <div className="input-container">
        <div className="message-input-area">
          <div className="input-controls">
            <label className="control-button" title="Upload fajla">
              <input
                type="file"
                onChange={handleFileUpload}
                multiple
                style={{ display: 'none' }}
              />
              <span>📁</span>
            </label>
            <label className="control-button" title="Upload slike">
              <input
                type="file"
                onChange={handleImageUpload}
                accept="image/*"
                multiple
                style={{ display: 'none' }}
              />
              <span>🖼️</span>
            </label>
            <select
              value={selectedMcpServer} 
              onChange={handleServerChange}
              className="model-select"
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="google">Google</option>
            </select>
          </div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Unesite vaš upit..." 
            disabled={sending.current}
          />
          
          <button
            onClick={handleSend}
            disabled={sending.current || !message.trim()}
            className={`send-button ${sending.current ? 'sending' : ''}`}
          >
            {sending.current ? 'Šaljem...' : 'Pošalji'}
          </button>
        </div>
      </div>
      
      <style>{`
        .chat-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          max-height: 100%;
          border-radius: 8px;
          overflow: hidden;
        }
        
        .chat-header {
          background-color: #1a1a2e;
          color: white;
          padding: 10px 15px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .reset-button {
          background-color: #e53e3e;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 5px 10px;
          font-size: 0.8rem;
          cursor: pointer;
        }
        
        .reset-button:hover {
          background-color: #c53030;
        }
        
        .temperature-control {
          display: flex;
          align-items: center;
          gap: 8px;
          color: white;
          font-size: 0.8rem;
        }
        
        .temperature-slider {
          width: 100px;
          height: 4px;
          -webkit-appearance: none;
          background: #4a5568;
          border-radius: 2px;
          outline: none;
        }
        
        .temperature-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
          background: #3a86ff;
          border-radius: 50%;
          cursor: pointer;
        }
        
        .upload-controls {
          display: flex;
          gap: 5px;
        }
        
        .upload-button {
          background: none;
          border: 1px solid #4a5568;
          border-radius: 4px;
          padding: 4px 8px;
          cursor: pointer;
          color: white;
        }
        
        .upload-button:hover {
          background-color: #2d3748;
        }
        
        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 15px;
          background-color: #0f0f1a;
        }
        
        .empty-chat {
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          color: #a0aec0;
        }
        
        .message {
          margin-bottom: 15px;
          padding: 12px;
          border-radius: 8px;
          max-width: 85%;
        }
        
        .user-message {
          background-color: #3a86ff;
          color: white;
          margin-left: auto;
        }
        
        .assistant-message {
          background-color: #2d3748;
          color: white;
          margin-right: auto;
        }
        
        .message-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 5px;
          font-size: 0.8rem;
          opacity: 0.8;
        }
        
        .message-content {
          word-break: break-word;
          line-height: 1.5;
        }
        
        .message-content pre {
          background-color: #1a1a2e !important;
          padding: 10px;
          border-radius: 4px;
          overflow-x: auto;
          margin: 10px 0;
        }
        
        .input-container {
          padding: 10px;
          background-color: #1a1a2e;
        }

        .message-input-area {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .input-controls {
          display: flex;
          gap: 4px;
          align-items: center;
        }

        .control-button {
          background: none;
          border: 1px solid #4a5568;
          border-radius: 4px;
          padding: 8px;
          height: 40px;
          width: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: white;
        }

        .control-button:hover {
          background-color: #2d3748;
        }

        .model-select {
          background-color: #1a1a2e;
          color: white;
          border: 1px solid #4a5568;
          border-radius: 4px;
          padding: 8px;
          height: 40px;
          cursor: pointer;
          font-size: 0.9rem;
        }

        .model-select option {
          background-color: #1a1a2e;
          color: white;
          padding: 8px;
        }

        textarea {
          flex: 1;
          border: 1px solid #4a5568;
          border-radius: 4px;
          padding: 8px 12px;
          resize: none;
          height: 40px;
          background-color: #2d3748;
          color: white;
          font-size: 0.9rem;
        }

        .send-button {
          background-color: #3a86ff;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 8px 16px;
          height: 40px;
          cursor: pointer;
          transition: background-color 0.3s;
          font-size: 0.9rem;
        }

        .send-button:hover:not(:disabled) {
          background-color: #2d75e8;
        }

        .send-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        
        .error-message {
          background-color: #e53e3e;
          color: white;
          padding: 8px 12px;
          margin: 0;
        }
        
        .toggle-container {
          display: flex;
          gap: 8px;
          font-size: 0.8rem;
        }
        
        .toggle-container label {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        
        .model-info {
          font-size: 0.7rem;
          background-color: #4a5568;
          padding: 2px 5px;
          border-radius: 3px;
        }
        
        .workflow-info {
          display: flex;
          gap: 8px;
          margin-top: 8px;
          font-size: 0.8rem;
        }
        
        .workflow-badge, .debug-badge {
          padding: 3px 6px;
          border-radius: 4px;
        }
        
        .workflow-badge {
          background-color: #4c51bf;
        }
        
        .debug-badge {
          background-color: #38a169;
        }
      `}</style>
    </div>
  );
};

export default ChatBox;