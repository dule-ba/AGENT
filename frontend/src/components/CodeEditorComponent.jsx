import React, { useState, useCallback, useEffect } from 'react';
import Editor from "@monaco-editor/react";
import axios from 'axios';

export default function CodeEditor({ 
  code = "# Unesite Python kod ovdje\nprint('Zdravo, svijete!')", 
  language = "python",
  onChange,
  onLanguageChange,
  sessionId,
  onExecute
}) {
  const [editorCode, setEditorCode] = useState(code);
  const [output, setOutput] = useState("");
  const [isLoading, setLoading] = useState(false);
  const [editorLanguage, setEditorLanguage] = useState(language);
  const [error, setError] = useState(null);
  
  // Sinhronizuj editorCode sa vanjskim code prop-om
  useEffect(() => {
    if (code !== editorCode) {
      setEditorCode(code);
    }
  }, [code]);
  
  // Sinhronizuj editorLanguage sa vanjskim language prop-om
  useEffect(() => {
    if (language !== editorLanguage) {
      setEditorLanguage(language);
    }
  }, [language]);
  
  const handleEditorChange = useCallback((value) => {
    setEditorCode(value);
    // Propagiraj promjenu roditelju ako je onChange prop prisutan
    if (onChange) {
      onChange(value);
    }
  }, [onChange]);
  
  const handleLanguageChange = useCallback((e) => {
    const newLanguage = e.target.value;
    setEditorLanguage(newLanguage);
    // Propagiraj promjenu roditelju ako je onLanguageChange prop prisutan
    if (onLanguageChange) {
      onLanguageChange(newLanguage);
    }
  }, [onLanguageChange]);
  
  const executeCode = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.post('http://localhost:8000/execute-code', {
        code: editorCode,
        language: editorLanguage,
        sessionId: sessionId
      });
      
      if (response.data.status === 'error') {
        setOutput(`Greška: ${response.data.error || 'Nepoznata greška prilikom izvršavanja koda'}`);
        setError(response.data.error);
      } else {
        setOutput(response.data.output || "Nema izlaznog rezultata.");
      }
      
      // Obavijesti roditelja o izvršenju
      if (onExecute) {
        onExecute({
          output: response.data.output,
          error: response.data.error,
          status: response.data.status
        });
      }
      
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.detail || error.message;
      setOutput(`Greška: ${errorMessage}`);
      setError(errorMessage);
      
      if (onExecute) {
        onExecute({
          output: null,
          error: errorMessage,
          status: 'error'
        });
      }
      
      return { 
        status: 'error', 
        error: errorMessage 
      };
    } finally {
      setLoading(false);
    }
  }, [editorCode, editorLanguage, sessionId, onExecute]);
  
  // Metoda koja će biti dostupna vanjskim komponentama kroz ref
  const runCodeWithAgentHelp = useCallback(async () => {
    // Prvo pokušaj izvršiti kod
    const result = await executeCode();
    
    // Ako je došlo do greške, pošalji upit debugger agentu
    if (result.status === 'error' && result.error) {
      setOutput(`Detektovana greška! Koristim debugger agenta za pomoć...\n${result.error}`);
      
      try {
        // Pozovi debugger agenta za pomoć
        const agentResponse = await axios.post('http://localhost:8000/chat', {
          message: `Molim te analiziraj i ispravi sljedeći kod koji ima grešku:
          \`\`\`${editorLanguage}
          ${editorCode}
          \`\`\`
          
          Greška: ${result.error}
          
          Daj mi ispravljenu verziju koda.`,
          agent: 'debugger',
          session_id: sessionId || 'default'
        });
        
        if (agentResponse.data && agentResponse.data.response) {
          setOutput(`Debugger agent predlaže rješenje:\n\n${agentResponse.data.response}`);
          
          // Izvuci ispravljeni kod iz odgovora
          const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/g;
          const match = codeBlockRegex.exec(agentResponse.data.response);
          
          if (match && match[1]) {
            const fixedCode = match[1].trim();
            // Postavi ispravljeni kod (ali ne primijeni ga automatski)
            setOutput(`${output}\n\nPredloženi ispravljeni kod:\n${fixedCode}`);
          }
        }
      } catch (agentError) {
        setOutput(`${output}\n\nGreška pri traženju pomoći od agenta: ${agentError.message}`);
      }
    }
  }, [executeCode, editorCode, editorLanguage, sessionId]);
  
  return (
    <div className="code-editor-container">
      <div className="editor-header">
        <h3>AI Agent Code Editor</h3>
        <div className="language-selector">
          <label htmlFor="language-select">Jezik:</label>
          <select 
            id="language-select" 
            value={editorLanguage} 
            onChange={handleLanguageChange}
          >
            <option value="python">Python</option>
            <option value="javascript">JavaScript</option>
            <option value="html">HTML</option>
          </select>
        </div>
      </div>
      
      <div className="editor-wrapper">
        <Editor
          height="400px"
          language={editorLanguage}
          value={editorCode}
          onChange={handleEditorChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 14,
            automaticLayout: true,
            wordWrap: 'on',
            tabSize: 4,
            insertSpaces: true
          }}
        />
      </div>
      
      <div className="editor-controls">
        <button 
          onClick={executeCode} 
          disabled={isLoading}
          className="execute-button"
        >
          {isLoading ? "Izvršavanje..." : "Pokreni kod"}
        </button>
        
        <button 
          onClick={runCodeWithAgentHelp} 
          disabled={isLoading}
          className="debug-button"
        >
          Ispravi greške
        </button>
      </div>
      
      <div className="output-container">
        <h3>Rezultat izvršavanja:</h3>
        <pre className={`output-content ${error ? 'error' : ''}`}>{output}</pre>
      </div>
      
      <style>{`
        .code-editor-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          background-color: #1e1e2e;
          color: #f8f8f2;
          border-radius: 8px;
          overflow: hidden;
        }
        
        .editor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 15px;
          background-color: #181825;
          border-bottom: 1px solid #313244;
        }
        
        .editor-header h3 {
          margin: 0;
          font-size: 1.2rem;
        }
        
        .language-selector {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .language-selector select {
          background-color: #313244;
          color: #f8f8f2;
          border: none;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
        }
        
        .editor-wrapper {
          flex: 1;
          min-height: 400px;
          border: 1px solid #313244;
        }
        
        .editor-controls {
          padding: 10px 15px;
          background-color: #181825;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }
        
        .execute-button {
          background-color: #74c7ec;
          color: #1e1e2e;
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
          transition: background-color 0.2s;
        }
        
        .debug-button {
          background-color: #f5c2e7;
          color: #1e1e2e;
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
          transition: background-color 0.2s;
        }
        
        .execute-button:hover:not(:disabled) {
          background-color: #89dceb;
        }
        
        .debug-button:hover:not(:disabled) {
          background-color: #f8c8ee;
        }
        
        .execute-button:disabled, .debug-button:disabled {
          background-color: #6c7086;
          cursor: not-allowed;
        }
        
        .output-container {
          padding: 15px;
          background-color: #11111b;
          border-top: 1px solid #313244;
          max-height: 200px;
          overflow-y: auto;
        }
        
        .output-container h3 {
          margin-top: 0;
          font-size: 1rem;
          color: #cdd6f4;
        }
        
        .output-content {
          background-color: #181825;
          padding: 10px;
          border-radius: 4px;
          margin: 0;
          white-space: pre-wrap;
          font-family: monospace;
          min-height: 100px;
        }
        
        .output-content.error {
          border-left: 3px solid #f38ba8;
          background-color: #1e1e2eff;
        }
      `}</style>
    </div>
  );
} 