import React, { useState, useRef } from 'react';
import { sendChatMessage, executeWorkflow } from './api';
import Sidebar from './components/Sidebar';
import ChatBox from './components/ChatBox';
import TaskFlow from './components/TaskFlow';
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
  
  // Referenca za TokenUsageTracker komponentu
  const tokenTrackerRef = useRef(null);
  
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
    setSessionHistory(session);
    
    // Prikaži posljednji odgovor iz sesije u radnom okruženju
    if (session && session.history && session.history.length > 0) {
      setAgentResult(session.history[session.history.length - 1].response);
    }
    
    // Prebaci na chat pregled
    setActiveSection('chat');
  };
  
  // Rukovanje ponovnim pokretanjem agenta sa izmijenjenim promptom
  const handleRerun = async (agentType, index) => {
    if (!agentResult) return;
    
    let userMessage;
    
    if (agentResult.workflowResult) {
      // Za workflow, ponovo pokreni sa originalnim promptom ali specifičnim agentom
      userMessage = agentResult.workflowResult.originalPrompt || "Generiši ponovo";
    } else {
      // Inače, traži korisnika da izmijeni prompt
      userMessage = prompt(
        'Izmijenite prompt za ponovno pokretanje:', 
        agentResult.message || ''
      );
    }
    
    if (!userMessage) return;
    
    try {
      let result;
      
      // Ako je prethodni rezultat bio workflow, koristimo executeWorkflow API
      if (agentResult.workflowResult) {
        result = await executeWorkflow(userMessage, agentType);
        result = {
          response: result.codeResult?.response || result.executionResult?.debugResult || "Nema odgovora",
          flow: result.codeResult ? ["Executor", "Code"] : ["Executor"],
          agents: result.codeResult ? [result.codeResult.response] : [],
          workflowResult: result
        };
      } else {
        // Inače, koristimo standardni API
        result = await sendChatMessage(userMessage, agentType);
      }
      
      setAgentResult(result);
    } catch (error) {
      console.error('Error during rerun:', error);
      alert(`Greška prilikom ponovnog pokretanja: ${error.message}`);
    }
  };
  
  // Toggle za prikazivanje/sakrivanje Token trackera
  const toggleTokenTracker = () => {
    setShowTokenTracker(!showTokenTracker);
  };
  
  // Rendering ovisno o aktivnoj sekciji
  const renderContent = () => {
    switch (activeSection) {
      case 'chat':
        return (
          <div className="grid-layout">
            <div className="chat-area glass-card">
              <ChatBox 
                onResultChange={handleResultChange} 
                onWorkflowResult={handleWorkflowResult} 
              />
            </div>
            <div className="flow-area glass-card">
              <TaskFlow flowData={agentResult} onRerun={handleRerun} workflowActive={workflowActive} />
            </div>
            <div className="workspace-area glass-card">
              <WorkEnvironment result={agentResult} />
            </div>
            
            {/* Token Usage Tracker (fiksiran na dnu) */}
            {showTokenTracker && (
              <div className="fixed bottom-4 right-4 z-10 w-80">
                <TokenUsageTracker ref={tokenTrackerRef} />
              </div>
            )}
          </div>
        );
        
      case 'sessions':
        return <SessionExplorer onSessionSelect={handleSessionSelect} />;
        
      case 'agents':
        return (
          <div className="glass-card p-5">
            <h2 className="text-xl font-bold mb-4">Agenti</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              {['executor', 'code', 'planner', 'data', 'debugger', 'mcp_router'].map(agentType => (
                <div key={agentType} className={`agent-node ${agentType} p-4`}>
                  <h3 className="text-lg font-medium capitalize">
                    {agentType === 'mcp_router' ? 'MCP Router' : agentType.charAt(0).toUpperCase() + agentType.slice(1)} Agent
                  </h3>
                  <p className="mt-2 text-sm opacity-80">
                    {agentType === 'executor' && 'Glavni agent koji koordinira rad ostalih agenata.'}
                    {agentType === 'code' && 'Specijaliziran za generiranje i analizu koda.'}
                    {agentType === 'planner' && 'Kreira planove i pomaže u donošenju odluka.'}
                    {agentType === 'data' && 'Analizira i obrađuje podatke i statistike.'}
                    {agentType === 'debugger' && 'Automatski otkriva i ispravlja greške u kodu.'}
                    {agentType === 'mcp_router' && 'Automatski odabire optimalni model za tip upita.'}
                  </p>
                </div>
              ))}
            </div>
            <div className="text-center mt-8 opacity-75 text-sm">
              <p>Uskoro: mogućnost prilagođavanja i kreiranja vlastitih agenata</p>
            </div>
          </div>
        );
        
      case 'settings':
        return (
          <div className="glass-card p-5">
            <h2 className="text-xl font-bold mb-4">Postavke</h2>
            <p className="mb-6 opacity-75">Konfiguracija agenata i sistema.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-800 bg-opacity-50 p-4 rounded">
                <h3 className="text-lg font-medium mb-4">OpenAI API Postavke</h3>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-400 mb-2">API Ključ</label>
                  <input type="password" className="input-field" placeholder="sk-..." disabled value="••••••••••••••••••••••••••••••••••" />
                  <p className="text-xs mt-1 text-gray-500">Postavljeno kroz .env fajl na backend strani</p>
                </div>
              </div>
              
              <div className="bg-gray-800 bg-opacity-50 p-4 rounded">
                <h3 className="text-lg font-medium mb-4">Anthropic API Postavke</h3>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-400 mb-2">API Ključ</label>
                  <input type="password" className="input-field" placeholder="sk-ant-..." disabled value="••••••••••••••••••••••••••••••••••" />
                  <p className="text-xs mt-1 text-gray-500">Postavljeno kroz .env fajl na backend strani</p>
                </div>
              </div>
            </div>
            
            <div className="mt-6 bg-gray-800 bg-opacity-50 p-4 rounded">
              <h3 className="text-lg font-medium mb-4">Automatski tok rada</h3>
              <div className="mb-4">
                <div className="flex items-center">
                  <input 
                    type="checkbox" 
                    id="autoWorkflow" 
                    className="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
                    checked={workflowActive}
                    onChange={() => setWorkflowActive(!workflowActive)}
                  />
                  <label htmlFor="autoWorkflow" className="ml-2 text-gray-300">
                    Omogući automatski tok rada između agenata
                  </label>
                </div>
                <p className="text-xs mt-2 text-gray-500">
                  Kada je uključeno, sistem će automatski procesirati tok: generiranje koda → izvršavanje → debugiranje → prikaz
                </p>
              </div>
            </div>

            <div className="mt-6 bg-gray-800 bg-opacity-50 p-4 rounded">
              <h3 className="text-lg font-medium mb-4">Praćenje potrošnje tokena</h3>
              <div className="mb-4">
                <div className="flex items-center">
                  <input 
                    type="checkbox" 
                    id="tokenTracker" 
                    className="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
                    checked={showTokenTracker}
                    onChange={toggleTokenTracker}
                  />
                  <label htmlFor="tokenTracker" className="ml-2 text-gray-300">
                    Prikaži praćenje potrošnje tokena
                  </label>
                </div>
                <p className="text-xs mt-2 text-gray-500">
                  Prati potrošnju tokena i troškove po API providerima i modelima
                </p>
              </div>
            </div>
            
            <div className="text-center mt-8 opacity-75 text-sm">
              <p>Uskoro: više opcija za prilagođavanje sistema</p>
            </div>
          </div>
        );
        
      case 'docs':
        return (
          <div className="glass-card p-5">
            <h2 className="text-xl font-bold mb-4">Dokumentacija</h2>
            <div className="space-y-6">
              <section>
                <h3 className="text-lg font-medium">O platformi</h3>
                <p className="mt-2">
                  AI Agent Platform je napredni sistem za interakciju s različitim specijaliziranim AI agentima. 
                  Za razliku od običnih chatbotova, ova platforma omogućuje vizualni prikaz toka rada i 
                  interakciju s različitim komponentama procesa.
                </p>
              </section>
              
              <section>
                <h3 className="text-lg font-medium">Kako koristiti sistem</h3>
                <ul className="list-disc ml-5 mt-2 space-y-2">
                  <li>Započnite upitom u Chat sekciji</li>
                  <li>Koristite različite agente za specifične zadatke</li>
                  <li>Pratite tok rada kroz vizualni prikaz</li>
                  <li>Izvršavajte i testirajte generisani kod</li>
                  <li>Ponovite ili refinišite rezultate po potrebi</li>
                </ul>
              </section>
            </div>
          </div>
        );
        
      default:
        return <div>Odaberite sekciju iz menija</div>;
    }
  };

  return (
    <div className="app-container">
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />
      <main className="content-area">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;