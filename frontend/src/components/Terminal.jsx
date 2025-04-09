import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import axios from 'axios';

const Terminal = forwardRef(({ initialCommands = [] }, ref) => {
  const [history, setHistory] = useState([]);
  const [currentCommand, setCurrentCommand] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const terminalRef = useRef(null);
  const inputRef = useRef(null);
  const [commands, setCommands] = useState(initialCommands);
  
  // Izvršava komandu i vraća rezultat
  const executeCommand = async (command) => {
    setIsProcessing(true);
    
    try {
      // Ako je komanda pip install, simuliraj instalaciju
      if (command.startsWith('pip install')) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return {
          output: `Simuliram instalaciju: ${command.replace('pip install', '')}...
Prikupljanje informacija o paketu...
Preuzimam paket...
Instaliram ovisnosti...
Uspješno instalirano!`,
          error: null
        };
      }
      
      // Ako je komanda python, simuliraj pokretanje skripte
      if (command.startsWith('python ')) {
        const scriptName = command.replace('python ', '').trim();
        return {
          output: `# Pokretanje Python aplikacije
$ python ${scriptName}

# Output će biti prikazan ovdje
# Napomena: Ovo je simulacija. Pravi output zahtijeva server za izvršavanje koda.`,
          error: null
        };
      }
      
      // Simuliraj izvršavanje ostalih komandi
      const simulatedOutput = `$ ${command}

# Simulirana izvedba komande
# Napomena: Ovo je simulacija terminalnog okruženja.
# Stvarna izvedba komandi zahtijeva backend server sa shell pristupom.`;
      
      return {
        output: simulatedOutput,
        error: null
      };
    } catch (error) {
      return {
        output: null,
        error: `Greška pri izvršavanju komande: ${error.message}`
      };
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Dodaje novu komandu u historiju
  const addToHistory = (command, output = '', isError = false) => {
    setHistory(prev => [
      ...prev, 
      { 
        command, 
        output, 
        isError,
        timestamp: new Date().toISOString() 
      }
    ]);
  };
  
  // Reference metode koje će biti dostupne izvana
  useImperativeHandle(ref, () => ({
    executeCommand: async (command) => {
      setCurrentCommand(command);
      handleExecute(command);
    },
    addCommand: (command) => {
      setCommands(prev => [...prev, command]);
    },
    clearHistory: () => {
      setHistory([]);
    }
  }));
  
  // Izvršava komandu
  const handleExecute = async (cmd = null) => {
    const commandToExecute = cmd || currentCommand;
    if (!commandToExecute.trim()) return;
    
    addToHistory(commandToExecute);
    setCurrentCommand('');
    
    const result = await executeCommand(commandToExecute);
    
    if (result.error) {
      addToHistory('', result.error, true);
    } else if (result.output) {
      addToHistory('', result.output);
    }
    
    // Automatski scroll na dno
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  };
  
  // Izvršavanje komandi iz props-a
  useEffect(() => {
    const executeInitialCommands = async () => {
      if (commands.length > 0) {
        for (const cmd of commands) {
          await handleExecute(cmd);
          await new Promise(resolve => setTimeout(resolve, 500)); // Pauza između komandi
        }
        // Resetiraj komande
        setCommands([]);
      }
    };
    
    executeInitialCommands();
  }, [commands]);
  
  // Fokusira input polje kada se klikne bilo gdje u terminal
  const focusInput = () => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };
  
  // Enter izvršava komandu
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !isProcessing) {
      handleExecute();
    }
  };
  
  return (
    <div className="terminal-container" onClick={focusInput}>
      <div className="terminal-header">
        <div className="terminal-controls">
          <span className="terminal-circle red"></span>
          <span className="terminal-circle yellow"></span>
          <span className="terminal-circle green"></span>
        </div>
        <div className="terminal-title">Terminal</div>
      </div>
      
      <div className="terminal-body" ref={terminalRef}>
        <div className="terminal-welcome">
          <p>Dobrodošli u Terminal simulaciju!</p>
          <p>Ovo je sigurno okruženje za testiranje shell komandi.</p>
          <p>Unesite 'help' za listu dostupnih komandi.</p>
        </div>
        
        {history.map((item, index) => (
          <div key={index} className="terminal-item">
            {item.command && (
              <div className="terminal-command">
                <span className="terminal-prompt">$</span> {item.command}
              </div>
            )}
            {item.output && (
              <div className={`terminal-output ${item.isError ? 'error' : ''}`}>
                {item.output}
              </div>
            )}
          </div>
        ))}
        
        <div className="terminal-input-row">
          <span className="terminal-prompt">$</span>
          <input
            ref={inputRef}
            type="text"
            className="terminal-input"
            value={currentCommand}
            onChange={(e) => setCurrentCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            placeholder={isProcessing ? "Izvršavanje..." : "Unesite komandu..."}
            autoFocus
          />
        </div>
      </div>
      
      <style jsx>{`
        .terminal-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          background-color: #1e1e2e;
          color: #f8f8f2;
          border-radius: 8px;
          overflow: hidden;
          font-family: monospace;
        }
        
        .terminal-header {
          display: flex;
          align-items: center;
          padding: 10px;
          background-color: #181825;
          border-bottom: 1px solid #313244;
        }
        
        .terminal-controls {
          display: flex;
          gap: 6px;
          margin-right: 20px;
        }
        
        .terminal-circle {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }
        
        .red { background-color: #f38ba8; }
        .yellow { background-color: #f9e2af; }
        .green { background-color: #a6e3a1; }
        
        .terminal-title {
          flex: 1;
          text-align: center;
          font-weight: bold;
        }
        
        .terminal-body {
          flex: 1;
          padding: 15px;
          overflow-y: auto;
          white-space: pre-wrap;
        }
        
        .terminal-welcome {
          color: #89b4fa;
          margin-bottom: 15px;
        }
        
        .terminal-item {
          margin-bottom: 10px;
        }
        
        .terminal-command {
          color: #cdd6f4;
          margin-bottom: 5px;
        }
        
        .terminal-prompt {
          color: #a6e3a1;
          margin-right: 10px;
        }
        
        .terminal-output {
          color: #bac2de;
          padding: 5px 0;
        }
        
        .terminal-output.error {
          color: #f38ba8;
        }
        
        .terminal-input-row {
          display: flex;
          align-items: center;
          margin-top: 10px;
        }
        
        .terminal-input {
          flex: 1;
          background: transparent;
          border: none;
          color: #f8f8f2;
          font-family: inherit;
          font-size: inherit;
          padding: 0;
          margin-left: 5px;
          outline: none;
        }
      `}</style>
    </div>
  );
});

Terminal.displayName = 'Terminal';

export default Terminal; 