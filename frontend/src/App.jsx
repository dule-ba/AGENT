import React, { useState, useRef, useEffect } from 'react';
import { sendChatMessage, executeWorkflow } from './api';
import ChatBox from './components/ChatBox';
import WorkEnvironment from './components/WorkEnvironment';
import SessionExplorer from './components/SessionExplorer';
import TokenUsageTracker from './components/TokenUsageTracker';
import './App.css';

function App() {
  const [activeSection, setActiveSection] = useState('chat');
  const [agentResult, setAgentResult] = useState(null);
  const [sessionHistory, setSessionHistory] = useState(null);
  const [workflowActive, setWorkflowActive] = useState(false);
  const [showTokenTracker, setShowTokenTracker] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessions, setSessions] = useState([]);
  
  // Referenca za TokenUsageTracker komponentu
  const tokenTrackerRef = useRef(null);
  
  // Učitavanje sesija prilikom pokretanja
  useEffect(() => {
    // Ovdje bi inače dohvatili sesije s beckenda
    // Za sada samo demo sesije
    setSessions([
      { id: 'demo1', name: 'Todo App Razvoj', last_updated: '2025-04-10T12:30:00Z' },
      { id: 'demo2', name: 'Debugging JS koda', last_updated: '2025-04-09T18:45:00Z' },
      { id: 'demo3', name: 'Python analiza podataka', last_updated: '2025-04-08T09:15:00Z' },
    ]);
  }, []);
  
  // Rukovanje standardnim odgovorima agenata
  const handleResultChange = (result) => {
    console.log("Primljen standardni rezultat:", result);
    if (result) {
      setAgentResult(result);
      
      // Ako rezultat sadrži informacije o korištenim tokenima, ažuriraj tracker
      if (result.usage && tokenTrackerRef.current) {
        const { input_tokens, output_tokens } = result.usage;
        const provider = result.mcp_server || 'anthropic';
        const model = result.model || result.selected_model || 'default';
        
        tokenTrackerRef.current.updateTokenUsage(
          provider, 
          model, 
          input_tokens || 0, 
          output_tokens || 0
        );
      }
    }
  };
  
  // Rukovanje workflow rezultatima
  const handleWorkflowResult = (result) => {
    console.log("Primljen workflow rezultat:", result);
    if (result) {
      setAgentResult({
        response: result.codeResult?.response || "Workflow završen",
        workflowResult: result,
        flow: result.codeResult ? ["Executor", "Code"] : ["Executor"]
      });
      setWorkflowActive(true);
      
      // Ako rezultat sadrži informacije o korištenim tokenima, ažuriraj tracker
      if (result.codeResult?.usage && tokenTrackerRef.current) {
        const { input_tokens, output_tokens } = result.codeResult.usage;
        const provider = result.mcpServer || 'anthropic';
        const model = result.selected_model || result.codeResult.model || 'default';
        
        tokenTrackerRef.current.updateTokenUsage(
          provider, 
          model, 
          input_tokens || 0, 
          output_tokens || 0
        );
      }
    }
  };
  
  // Rukovanje odabirom sesije iz historije
  const handleSessionSelect = (session) => {
    setSelectedSession(session);
    
    // Prikaži posljednji odgovor iz sesije u radnom okruženju
    if (session && session.history && session.history.length > 0) {
      setAgentResult(session.history[session.history.length - 1].response);
    }
  };
  
  // Toggle za prikazivanje/sakrivanje Token trackera
  const toggleTokenTracker = () => {
    setShowTokenTracker(!showTokenTracker);
  };
  
  // Toggle za sidebar
  const toggleSidebar = () => {
    setShowSidebar(!showSidebar);
  };
  
  // Definicija ikona za navbar
  const getNavIcon = (icon) => {
    switch(icon) {
      case 'chat':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        );
      case 'sessions':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        );
      case 'settings':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        );
      case 'tokens':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        );
      default:
        return null;
    }
  };
  
  return (
    <div className="app-container h-screen flex">
      {/* Sidebar */}
      <div className={`sidebar ${showSidebar ? 'w-64' : 'w-16'} bg-gray-900 flex flex-col transition-all duration-300 ease-in-out border-r border-gray-700`}>
        {/* Logo / Header */}
        <div className="p-4 border-b border-gray-800 flex items-center">
          {showSidebar ? (
            <h1 className="text-xl font-bold text-white">AI Agent</h1>
          ) : (
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">AI</span>
            </div>
          )}
        </div>
        
        {/* Navigation */}
        <div className="flex-grow overflow-y-auto py-4">
          {/* Navigacijski gumbi */}
          <div className="space-y-1 px-2">
            <button 
              onClick={() => setActiveSection('chat')}
              className={`flex items-center w-full p-3 rounded-lg text-left transition-colors ${
                activeSection === 'chat' 
                  ? 'bg-gray-800 text-white' 
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {getNavIcon('chat')}
              {showSidebar && <span className="ml-3">Chat</span>}
            </button>
            
            <button 
              onClick={() => setActiveSection('sessions')}
              className={`flex items-center w-full p-3 rounded-lg text-left transition-colors ${
                activeSection === 'sessions' 
                  ? 'bg-gray-800 text-white' 
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {getNavIcon('sessions')}
              {showSidebar && <span className="ml-3">Sesije</span>}
            </button>
            
            <button 
              onClick={() => setActiveSection('settings')}
              className={`flex items-center w-full p-3 rounded-lg text-left transition-colors ${
                activeSection === 'settings' 
                  ? 'bg-gray-800 text-white' 
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {getNavIcon('settings')}
              {showSidebar && <span className="ml-3">Postavke</span>}
            </button>
          </div>
          
          {/* Lista sesija (kada je sidebar proširen) */}
          {showSidebar && activeSection === 'chat' && (
            <div className="mt-6 px-3">
              <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Nedavne sesije
              </h3>
              <div className="mt-2 space-y-1">
                {sessions.map(session => (
                  <button
                    key={session.id}
                    onClick={() => handleSessionSelect(session)}
                    className={`flex items-center w-full px-3 py-2 text-sm rounded-md ${
                      selectedSession?.id === session.id
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                    }`}
                  >
                    <span className="truncate">{session.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Footer buttons */}
        <div className="p-4 border-t border-gray-800">
          <button 
            onClick={toggleTokenTracker}
            className="flex items-center w-full p-2 rounded-lg text-left text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            title="Token Usage"
          >
            {getNavIcon('tokens')}
            {showSidebar && <span className="ml-3">Tokeni</span>}
          </button>
          
          <button 
            onClick={toggleSidebar}
            className="mt-2 flex items-center w-full p-2 rounded-lg text-left text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            title={showSidebar ? "Sakrij sidebar" : "Proširi sidebar"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transition-transform ${showSidebar ? 'transform rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            {showSidebar && <span className="ml-3">{showSidebar ? "Sakrij sidebar" : "Proširi sidebar"}</span>}
          </button>
        </div>
      </div>
      
      {/* Main content area */}
      <div className="flex-grow overflow-hidden">
        {activeSection === 'chat' && (
          <div className="h-full flex flex-col md:flex-row">
            {/* Chat area */}
            <div className="w-full md:w-1/2 h-full overflow-hidden flex flex-col border-r border-gray-700">
              <ChatBox 
                onResultChange={handleResultChange} 
                onWorkflowResult={handleWorkflowResult} 
              />
            </div>
            
            {/* Dynamic workspace */}
            <div className="w-full md:w-1/2 h-full overflow-hidden bg-gray-900">
              <WorkEnvironment result={agentResult} />
            </div>
          </div>
        )}
        
        {activeSection === 'sessions' && (
          <div className="h-full overflow-y-auto">
            <SessionExplorer onSessionSelect={handleSessionSelect} />
          </div>
        )}
        
        {activeSection === 'settings' && (
          <div className="h-full overflow-y-auto p-6">
            <div className="glass-card p-5 max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold mb-6">Postavke</h2>
              
              <div className="space-y-8">
                <div>
                  <h3 className="text-xl font-medium mb-3">API Postavke</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Anthropic API Ključ</label>
                      <input 
                        type="password" 
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" 
                        placeholder="sk-ant-..." 
                        value="••••••••••••••••••••••••••••••••••" 
                        disabled 
                      />
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-xl font-medium mb-3">Postavke Agenta</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Zadani Agent</label>
                    <select className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2">
                      <option>Executor</option>
                      <option>Code</option>
                      <option>Debugger</option>
                      <option>Planner</option>
                    </select>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-xl font-medium mb-3">Izgled i ponašanje</h3>
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <input type="checkbox" id="darkMode" className="mr-2" checked={true} readOnly />
                      <label htmlFor="darkMode">Tamni način rada</label>
                    </div>
                    
                    <div className="flex items-center">
                      <input type="checkbox" id="autoWorkflow" className="mr-2" checked={true} readOnly />
                      <label htmlFor="autoWorkflow">Automatski Workflow</label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Token Usage Tracker (ako je prikazan) */}
      {showTokenTracker && (
        <div className="fixed bottom-4 right-4 z-10 w-80">
          <TokenUsageTracker ref={tokenTrackerRef} />
        </div>
      )}
    </div>
  );
}

export default App;