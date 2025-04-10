import React, { useState, useEffect, useRef } from 'react';
import { sendChatMessage, executeWorkflow, getCurrentSessionId, resetSession, continueWorkflowExecution, getAvailableModels } from '../api';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markup';

// Funkcija za formatiranje blokova koda u tekstu
const formatCodeBlocks = (text) => {
  if (!text) return '';
  
  // Zamijeni Markdown code blockove sa syntax highlightingom
  let formattedText = text.replace(/```(\w+)?\n([\s\S]+?)\n```/g, (match, language, code) => {
    const lang = language || 'text';
    const highlightedCode = Prism.highlight(
      code,
      Prism.languages[lang] || Prism.languages.text,
      lang
    );
    return `<pre class="language-${lang}"><code class="language-${lang}">${highlightedCode}</code></pre>`;
  });
  
  // Zamijeni inline code blokove
  formattedText = formattedText.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  
  // Zamijeni new line karaktere sa <br> tagovima
  formattedText = formattedText.replace(/\n/g, '<br>');
  
  return formattedText;
};

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
  const [showSettings, setShowSettings] = useState(false);
  const messageEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const sending = useRef(false);
  const error = useRef(null);
  const [showWorkflowConfirmation, setShowWorkflowConfirmation] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [mcpServer, setMcpServer] = useState('anthropic');
  const [availableModels, setAvailableModels] = useState([]);
  const [isWorkflowEnabled, setIsWorkflowEnabled] = useState(false);

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

    // Učitaj konfiguraciju pri prvom renderiranju
    setSelectedModel(localStorage.getItem('selectedModel') || 'default');
    setSelectedAgent(localStorage.getItem('selectedAgent') || 'executor');
    setTemperature(parseFloat(localStorage.getItem('temperature') || '0.7'));
    setMcpServer(localStorage.getItem('mcpServer') || 'anthropic');
    setIsWorkflowEnabled(localStorage.getItem('isWorkflowEnabled') === 'true');

    // inicijalni session_id
    const sessionId = getCurrentSessionId();
    console.log("Trenutni session ID:", sessionId);

    // Učitaj chat history iz localStorage
    const savedMessages = localStorage.getItem('chatHistory');
    if (savedMessages) {
      setChatHistory(JSON.parse(savedMessages));
      setTimeout(() => scrollToBottom(), 100);
    }
  }, []);

  // Sačuvaj konfiguraciju kada se promijeni
  useEffect(() => {
    localStorage.setItem('selectedModel', selectedModel);
    localStorage.setItem('selectedAgent', selectedAgent);
    localStorage.setItem('temperature', temperature.toString());
    localStorage.setItem('mcpServer', mcpServer);
    localStorage.setItem('isWorkflowEnabled', isWorkflowEnabled.toString());
  }, [selectedModel, selectedAgent, temperature, mcpServer, isWorkflowEnabled]);

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

  // Učitaj dostupne modele kada se promijeni MCP server
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await getAvailableModels(mcpServer);
        if (response && response.models) {
          setAvailableModels(response.models);
          // Postavimo default model ako trenutno odabrani nije dostupan
          if (response.models.length > 0 && selectedModel !== 'default' && !response.models.includes(selectedModel)) {
            setSelectedModel('default');
          }
        }
      } catch (error) {
        console.error('Greška pri dohvatanju modela:', error);
        setAvailableModels([]);
      }
    };

    if (showAdvancedOptions) {
      fetchModels();
    }
  }, [showAdvancedOptions, mcpServer]);

  const handleSend = async () => {
    if (message.trim() === '') return;
    setIsLoading(true);
    
    try {
      // Dodaj korisničku poruku u UI
      const userMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: message
      };
      
      setChatHistory(prevMessages => [...prevMessages, userMessage]);
      setMessage(''); // Očisti input polje
      
      // Pripremi opcije za API poziv
      const options = {
        model: selectedModel,
        temperature: parseFloat(temperature),
        mcpServer: mcpServer, // Koristi odabrani MCP server
        auto_process: false
      };
      
      let response;
      
      // Izvršavanje pomoću workflow ili standardnog poziva
      if (isWorkflowEnabled) {
        // Koristi workflow za automatsko generisanje i izvršavanje koda
        response = await executeWorkflow(message, handleWorkflowConfirmation, options);
        
        if (response.inicijalni_odgovor) {
          const assistantMessage = {
            id: Date.now().toString() + '-assistant',
            role: 'assistant',
            content: response.inicijalni_odgovor,
            workflow: true,
            workflowData: response
          };
          
          setChatHistory(prevMessages => [...prevMessages, assistantMessage]);
        }
      } else {
        // Standardni poziv agenta
        response = await sendChatMessage(message, selectedAgent, options);
        
        const assistantMessage = {
          id: Date.now().toString() + '-assistant',
          role: 'assistant',
          content: response.response,
          suggested_agent: response.suggested_agent
        };
        
        setChatHistory(prevMessages => [...prevMessages, assistantMessage]);
      }
      
    } catch (error) {
      console.error('Greška pri slanju poruke:', error);
      
      // Prikaži grešku u chatu
      setChatHistory(prevMessages => [
        ...prevMessages,
        {
          id: Date.now().toString() + '-error',
          role: 'error',
          content: `Greška: ${error.message || 'Nepoznata greška'}`
        }
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => scrollToBottom(), 100);
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

  // novi moderan UI za chat
  return (
    <div className="flex flex-col h-full">
      {/* Poruke povijesti chata */}
      <div className="flex-grow overflow-y-auto p-4 space-y-6">
        {chatHistory.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="rounded-full bg-gradient-to-r from-blue-500 to-purple-600 p-3 mx-auto w-16 h-16 flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Dobrodošli u AI Agent Platformu</h3>
              <p className="text-gray-400 max-w-md mx-auto">
                Postavite svoje pitanje ili zahtjev, i agent će vam pomoći generirati i izvršiti kod.
              </p>
            </div>
          </div>
        ) : (
          chatHistory.map((chat, index) => (
            <div 
              key={index} 
              className={`flex ${chat.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`max-w-3/4 rounded-lg p-4 ${
                  chat.type === 'user' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-800 text-gray-100'
                }`}
              >
                {chat.type === 'user' ? (
                  <div>
                    <div className="mb-1 text-xs text-blue-200 opacity-75">Vi</div>
                    <div>{chat.text}</div>
                  </div>
                ) : (
                  <div>
                    <div className="mb-1 text-xs text-gray-400 flex items-center">
                      <span className="capitalize mr-1">{chat.agent || 'Agent'}</span>
                      {chat.workflow && (
                        <span className="bg-indigo-800 rounded-full px-2 py-0.5 text-xs ml-2">
                          Workflow
                        </span>
                      )}
                    </div>
                    <div 
                      className="prose prose-invert max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: formatCodeBlocks(chat.text)
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 text-gray-100 p-4 rounded-lg max-w-3/4">
              <div className="flex items-center space-x-2">
                <div className="animate-pulse flex space-x-1">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                </div>
                <span className="text-sm text-gray-400">Agent razmišlja...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messageEndRef} />
      </div>
      
      {/* Input dio - moderniziran dizajn */}
      <div className="border-t border-gray-700 p-4">
        {showSettings && (
          <div className="bg-gray-800 rounded-lg p-4 mb-4 animate-fadeIn">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Agent</label>
                <select 
                  value={selectedAgent} 
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="executor">Executor</option>
                  <option value="code">Code</option>
                  <option value="debugger">Debugger</option>
                  <option value="planner">Planner</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Model</label>
                <select 
                  value={selectedModel} 
                  onChange={(e) => {
                    setSelectedModel(e.target.value);
                    localStorage.setItem('mcp_preferred_model', e.target.value);
                  }}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="default">Default</option>
                  {availableModels.map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Temperatura</label>
                <div className="flex items-center space-x-2">
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.1" 
                    value={temperature}
                    onChange={(e) => {
                      setTemperature(parseFloat(e.target.value));
                      localStorage.setItem('mcp_preferred_temperature', e.target.value);
                    }}
                    className="flex-grow accent-blue-500"
                  />
                  <span className="text-sm text-gray-300 w-8">{temperature}</span>
                </div>
              </div>
            </div>
            
            <div className="mt-4 flex items-center">
              <label className="flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={automaticWorkflow}
                  onChange={() => {
                    setAutomaticWorkflow(!automaticWorkflow);
                    localStorage.setItem('mcp_auto_workflow', (!automaticWorkflow).toString());
                  }}
                  className="sr-only"
                />
                <div className={`${automaticWorkflow ? 'bg-blue-600' : 'bg-gray-700'} relative inline-flex items-center h-6 rounded-full w-11 transition-colors`}>
                  <span className={`${automaticWorkflow ? 'translate-x-6' : 'translate-x-1'} inline-block w-4 h-4 transform bg-white rounded-full transition-transform`} />
                </div>
                <span className="ml-2 text-sm text-gray-300">Workflow Mod</span>
              </label>
              <div className="ml-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 cursor-help" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5A1 1 0 1117 8a1 1 0 01.7 1.7l-3.467 3.467a1 1 0 01-.7.3H7.5a1 1 0 01-.5-2h2.167l3.53-3.53A1 1 0 0118 7a1 1 0 01-1 1h-1.7l-3.467 3.467A1 1 0 119 11a1 1 0 01-1-1v-1h-1v1a1 1 0 01-1 1H5a1 1 0 01-1-1v-2a1 1 0 011-1h2a1 1 0 111 1v1h1V8a1 1 0 01.5-.867A1 1 0 0110 7z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>
        )}
      
        {/* Prikazuje datoteke i slike ako postoje */}
        {(uploadedFiles.length > 0 || uploadedImages.length > 0) && (
          <div className="mb-2 flex flex-wrap gap-2">
            {uploadedFiles.map((file, index) => (
              <div key={`file-${index}`} className="bg-gray-700 rounded-lg px-3 py-1 flex items-center text-sm">
                <span className="mr-2">{file.name}</span>
                <button
                  onClick={() => handleRemoveFile(index)}
                  className="text-gray-400 hover:text-gray-200"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ))}
            
            {uploadedImages.map((image, index) => (
              <div key={`image-${index}`} className="bg-gray-700 rounded-lg px-3 py-1 flex items-center text-sm">
                <img src={URL.createObjectURL(image)} alt="Preview" className="h-5 w-5 object-cover mr-2 rounded" />
                <span className="mr-2">{image.name}</span>
                <button
                  onClick={() => handleRemoveImage(index)}
                  className="text-gray-400 hover:text-gray-200"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      
        <div className="relative">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Postavite pitanje ili zahtijevajte kod..."
            className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-3 pr-24 py-3 text-white resize-none min-h-[56px] max-h-36 overflow-y-auto focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            rows={message.split('\n').length > 3 ? Math.min(6, message.split('\n').length) : 1}
          />
          
          <div className="absolute bottom-2 right-2 flex space-x-1">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
              title="Postavke"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </button>
            
            <button 
              onClick={triggerFileUpload} 
              className="p-2 rounded hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
              title="Učitaj datoteku"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
              </svg>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                multiple
              />
            </button>
            
            <button 
              onClick={triggerImageUpload}
              className="p-2 rounded hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
              title="Učitaj sliku"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
              </svg>
              <input
                type="file"
                ref={imageInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                style={{ display: 'none' }}
                multiple
              />
            </button>
            
            <button
              onClick={handleSend}
              disabled={isLoading || (!message.trim() && uploadedFiles.length === 0 && uploadedImages.length === 0)}
              className={`p-2 rounded ${
                isLoading || (!message.trim() && uploadedFiles.length === 0 && uploadedImages.length === 0)
                  ? 'bg-blue-800 text-blue-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              } transition-colors`}
              title="Pošalji poruku"
            >
              {isLoading ? (
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          </div>
        </div>
        
        {/* Prikaz statusa sesije */}
        <div className="flex justify-between mt-2 text-xs text-gray-400">
          <div>
            {sessionInfo.active ? (
              <span>
                Aktivna sesija: {sessionInfo.id?.substring(0, 8)}...
                <button 
                  onClick={handleResetSession}
                  className="ml-2 text-blue-400 hover:text-blue-300 underline"
                >
                  Reset
                </button>
              </span>
            ) : (
              <span>Nova sesija</span>
            )}
          </div>
          
          <div className="flex items-center">
            <div className="settings-group">
              <label>
                <input
                  type="checkbox"
                  checked={isWorkflowEnabled}
                  onChange={(e) => {
                    setIsWorkflowEnabled(e.target.checked);
                    localStorage.setItem('isWorkflowEnabled', e.target.checked.toString());
                  }}
                />
                Workflow Mode
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatBox;