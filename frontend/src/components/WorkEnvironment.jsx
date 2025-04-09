import React, { useState, useEffect, useRef } from 'react';
import { executeCode as apiExecuteCode, sendChatMessage } from '../api';
import CodeEditorComponent from './CodeEditorComponent';
import Terminal from './Terminal';
import WebView from './WebView';

// Dodavanje CSS stilova direktno u komponentu
const workEnvironmentStyles = {
  glassCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    backdropFilter: 'blur(12px)',
    borderRadius: '0.5rem',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  },
  dynamicContent: {
    height: '100%',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  },
};

// Ažurirani tipovi okruženja
const ViewTypes = {
  MONACO: 'monaco',
  TERMINAL: 'terminal',
  WEB: 'web',
  PLACEHOLDER: 'placeholder'
};

const WorkEnvironment = ({ result }) => {
  const [viewType, setViewType] = useState(ViewTypes.PLACEHOLDER);
  const [extractedCode, setExtractedCode] = useState('');
  const [originalCode, setOriginalCode] = useState('');
  const [fixedCode, setFixedCode] = useState('');
  const [languageType, setLanguageType] = useState('python');
  const [terminalCommands, setTerminalCommands] = useState([]);
  const [webPreview, setWebPreview] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [executionOutput, setExecutionOutput] = useState('');
  const [executionError, setExecutionError] = useState('');
  const [isLoadingDebugFix, setIsLoadingDebugFix] = useState(false);
  const [debugResult, setDebugResult] = useState(null);
  const [extractedCss, setExtractedCss] = useState('');
  const [extractedJs, setExtractedJs] = useState('');
  const [fullStackCode, setFullStackCode] = useState(false);
  const [isWorkflowResult, setIsWorkflowResult] = useState(false);
  const [showOriginalCode, setShowOriginalCode] = useState(false);
  const [editorOutput, setEditorOutput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  
  const iframeRef = useRef(null);
  const terminalRef = useRef(null);
  
  const detectViewType = (content, languageHint = null) => {
    if (!content) return ViewTypes.PLACEHOLDER;

    // Prioritet za HTML/Markup -> WEB prikaz
    if (languageHint === 'html' || languageHint === 'markup' || /<html|<!DOCTYPE html/i.test(content)) {
       // Dodatna provjera da nije samo npr. Python sa HTML stringom
       const codeBlockRegex = /```([a-z]*)\\n([\\s\\S]*?)\\n```/i;
       const match = content.match(codeBlockRegex);
       if (!match || match[1] === 'html' || match[1] === 'markup') {
           return ViewTypes.WEB;
       }
    }

    // Provjera za terminal komande
    if (languageHint === 'bash' || /^[$#>].*$/m.test(content)) {
       // Ako je samo komentar ili prazan red, ne mora biti terminal
       if (content.trim().length > 1 && !content.trim().startsWith('#')) {
           return ViewTypes.TERMINAL;
       }
    }

    // Provjera za ostale kodne jezike -> MONACO prikaz
    const codeBlockRegex = /```([a-z]*)\\n([\\s\\S]*?)\\n```/i;
    const match = content.match(codeBlockRegex);
    if (match && match[2].trim()) {
      // Provjeri da nije HTML/markup, to ide u WEB
      if (match[1] !== 'html' && match[1] !== 'markup') {
        return ViewTypes.MONACO;
      }
    }

    // Provjera za kodne paterne ako nema ``` blokova
    const codePatterns = {
      python: /^(def|class|import|from|if|for|while)\\s+.+:/m,
      javascript: /^(const|let|var|function|class|import)\\s+.+/m,
      css: /\\s*\\{\\s*[\\s\\S]*?\\s*\\}/m,
      sql: /SELECT|FROM|WHERE|INSERT|UPDATE|DELETE/i,
    };

    for (const [lang, pattern] of Object.entries(codePatterns)) {
      if ((languageHint === lang || !languageHint) && pattern.test(content)) {
        return ViewTypes.MONACO;
      }
    }

    // Ako je samo tekstualni odgovor bez prepoznatljivog koda/komandi
    // PROMJENA: Prikazujemo MONACO s text language umjesto PLACEHOLDER
    if (!/<\/?[a-z][\s\S]*>/i.test(content)) {
        // Ako imamo bilo kakav tekstualni sadržaj, prikaži ga u editoru
        if (content.trim().length > 0) {
            return ViewTypes.MONACO;
        }
        return ViewTypes.PLACEHOLDER;
    }

    // Fallback ako je nešto nedefinisano (npr. samo HTML fragment van ```)
    return ViewTypes.WEB;
  };
  
  const extractCodeBlocks = (content) => {
    if (!content) return { code: '', language: 'text' };
    
    setExtractedCss('');
    setExtractedJs('');
    setFullStackCode(false);
    
    const htmlBlockRegex = /```(?:html|markup)\\n([\\s\\S]*?)\\n```/gi;
    const cssBlockRegex = /```(?:css)\\n([\\s\\S]*?)\\n```/gi;
    const jsBlockRegex = /```(?:javascript|js)\\n([\\s\\S]*?)\\n```/gi;
    
    htmlBlockRegex.lastIndex = 0;
    cssBlockRegex.lastIndex = 0;
    jsBlockRegex.lastIndex = 0;

    let htmlMatch = htmlBlockRegex.exec(content);
    let cssMatch = cssBlockRegex.exec(content);
    let jsMatch = jsBlockRegex.exec(content);
    
    let htmlCode = '';
    let cssCode = '';
    let jsCode = '';
    
    if (htmlMatch && htmlMatch[1]) {
      htmlCode = htmlMatch[1].trim();
    }
    
    if (cssMatch && cssMatch[1]) {
      cssCode = cssMatch[1].trim();
      setExtractedCss(cssCode);
    } else {
      const styleTagRegex = /<style>([\\s\\S]*?)<\/style>/gi;
      styleTagRegex.lastIndex = 0;
      const styleMatch = styleTagRegex.exec(content);
      if (styleMatch && styleMatch[1]) {
        cssCode = styleMatch[1].trim();
        setExtractedCss(cssCode);
      }
    }
    
    if (jsMatch && jsMatch[1]) {
      jsCode = jsMatch[1].trim();
      setExtractedJs(jsCode);
    } else {
      const scriptTagRegex = /<script>([\\s\\S]*?)<\/script>/gi;
      scriptTagRegex.lastIndex = 0;
      const scriptMatch = scriptTagRegex.exec(content);
      if (scriptMatch && scriptMatch[1]) {
        jsCode = scriptMatch[1].trim();
        setExtractedJs(jsCode);
      }
    }
    
    if (!htmlCode && /<\/?[a-z][\s\S]*>/i.test(content)) {
        const genericBlockRegex = /```[a-z]*\\n[\\s\\S]*?<\/?[a-z][\s\S]*>[\s\S]*?\\n```/i;
        genericBlockRegex.lastIndex = 0;
        if (!genericBlockRegex.test(content)) {
             htmlCode = content;

            if (!cssCode) {
                const styleTagRegex = /<style>([\\s\\S]*?)<\/style>/gi;
                styleTagRegex.lastIndex = 0;
                let styleMatch;
                while ((styleMatch = styleTagRegex.exec(htmlCode)) !== null) {
                    cssCode += styleMatch[1].trim() + "\\n";
                }
                if (cssCode) setExtractedCss(cssCode);
            }
            if (!jsCode) {
                const scriptTagRegex = /<script>([\\s\\S]*?)<\/script>/gi;
                scriptTagRegex.lastIndex = 0;
                let scriptMatch;
                 while ((scriptMatch = scriptTagRegex.exec(htmlCode)) !== null) {
                    jsCode += scriptMatch[1].trim() + "\\n";
                }
                 if (jsCode) setExtractedJs(jsCode);
            }
        }
    }
    
    if (htmlCode && (cssCode || jsCode)) {
      setFullStackCode(true);
    }
    
    if (htmlCode) {
      return { code: htmlCode, language: 'markup' };
    }
    
    const codeBlockRegex = /```([a-z]*)\\n([\\s\\S]*?)\\n```/i;
    codeBlockRegex.lastIndex = 0;
    const match = content.match(codeBlockRegex);
    
    if (match && match[2].trim()) {
      let language = match[1].trim() || 'python';
      if (language === 'js') language = 'javascript';
      if (language === 'py') language = 'python';
      
      return {
        code: match[2],
        language
      };
    }
    
    const codePatterns = {
      python: /^(def|class|import|from|if|for|while)\\s+.+:/m,
      javascript: /^(const|let|var|function|class|import)\\s+.+/m,
      css: /\\s*\\{\\s*[\\s\\S]*?\\s*\\}/m,
      sql: /SELECT|FROM|WHERE|INSERT|UPDATE|DELETE/i,
      bash: /^[$#>].*$/m,
    };

    for (const [lang, pattern] of Object.entries(codePatterns)) {
      if (pattern.test(content)) {
         if (!/<\/?[a-z][\s\S]*>/i.test(content)) {
             return { code: content, language: lang };
         }
      }
    }

    return { code: content, language: 'text' };
  };
  
  const generateTerminalCommands = (code, language) => {
    const commands = [];
    
    if (language === 'python') {
      commands.push({
        command: '# Kreiranje Python fajla',
        output: ''
      });
      
      commands.push({
        command: '$ echo "' + code.replace(/"/g, '\\"').substring(0, 100) + '..." > app.py',
        output: ''
      });
      
      commands.push({
        command: '# Pokretanje Python aplikacije',
        output: ''
      });
      
      if (code.includes('tkinter') || code.includes('Tk()')) {
        commands.push({
          command: '$ python app.py',
          output: '# Pokrenuta je GUI aplikacija u zasebnom prozoru...'
        });
      } else {
        commands.push({
          command: '$ python app.py',
          output: '# Izlaz programa će biti prikazan ovdje...'
        });
      }
    } else if (language === 'javascript' || language === 'js') {
      commands.push({
        command: '# Kreiranje JavaScript fajla',
        output: ''
      });
      
      commands.push({
        command: '$ echo "' + code.replace(/"/g, '\\"').substring(0, 100) + '..." > app.js',
        output: ''
      });
      
      commands.push({
        command: '# Pokretanje JavaScript aplikacije',
        output: ''
      });
      
      commands.push({
        command: '$ node app.js',
        output: '# Izlaz programa će biti prikazan ovdje...'
      });
    } else if (language === 'markup' || language === 'html') {
      commands.push({
        command: '# Kreiranje HTML fajla',
        output: ''
      });
      
      commands.push({
        command: '$ echo "' + code.replace(/"/g, '\\"').substring(0, 100) + '..." > index.html',
        output: ''
      });
      
      if (extractedCss) {
        commands.push({
          command: '# Kreiranje CSS fajla',
          output: ''
        });
        
        commands.push({
          command: '$ echo "' + extractedCss.replace(/"/g, '\\"').substring(0, 100) + '..." > styles.css',
          output: ''
        });
      }
      
      if (extractedJs) {
        commands.push({
          command: '# Kreiranje JavaScript fajla',
          output: ''
        });
        
        commands.push({
          command: '$ echo "' + extractedJs.replace(/"/g, '\\"').substring(0, 100) + '..." > script.js',
          output: ''
        });
      }
      
      commands.push({
        command: '# Za otvaranje HTML datoteke u pregledniku',
        output: 'Otvorite index.html u vašem web pregledniku'
      });
    } else if (language === 'bash') {
        code.split('\\n').forEach(line => {
            if (line.trim()) {
                 commands.push({ command: line, output: '' });
            }
        });
    }
    
    return commands;
  };
  
  const prepareWebPreview = (code, language) => {
    if (language === 'markup' || language === 'html') {
       return prepareFullHtmlWithResources(code, extractedCss, extractedJs);
    }
    else if (language === 'python') {
      return `<div class="py-console">
        <h3>Python Web Console</h3>
        <pre class="console-output">
# Pokretanje Python aplikacije
$ python app.py

# Output će biti prikazan ovdje
# Napomena: Ovo je simulacija. Pravi output zahtijeva server za izvršavanje koda.
        </pre>
      </div>`;
    } else if (language === 'javascript') {
      return `<div class="js-console">
        <h3>JavaScript Console</h3>
        <pre class="console-output">
// Pokretanje JavaScript aplikacije
$ node app.js

// Output će biti prikazan ovdje
// Napomena: Ovo je simulacija. Pravi output zahtijeva server za izvršavanje koda.
        </pre>
      </div>`;
    }
    
    return `<div class="preview-placeholder">
      <p>Web pregled nije dostupan za ovaj tip sadržaja.</p>
    </div>`;
  };
  
  const debugCode = async () => {
    if (!extractedCode || !executionError) return;
    
    setIsLoadingDebugFix(true);
    
    try {
      const debugMessage = `Debug ovaj kod i ispravi sve greške. Niže je kod i greška koja se dogodi pri izvršavanju:
      
KOD:
\`\`\`${languageType}
${extractedCode}
\`\`\`

GREŠKA:
${executionError}

Molim te vrati kompletan kod s ispravkama, objasni šta je bio problem, i šta si promijenio.`;
      
      const result = await sendChatMessage(debugMessage, 'debugger', sessionId);
      
      setDebugResult(result.response);
      setSessionId(result.session_id);

      const fixedCodeMatch = result.response.match(/```(?:[a-z]*)\\n([\\s\\S]*?)\\n```/i);
      if (fixedCodeMatch && fixedCodeMatch[1]) {
        setExtractedCode(fixedCodeMatch[1]);
         const langMatch = result.response.match(/```([a-z]*)/i);
         if (langMatch && langMatch[1]) {
             let lang = langMatch[1].trim();
             if (lang === 'js') lang = 'javascript';
             if (lang === 'py') lang = 'python';
             setLanguageType(lang);
         }
         setExecutionError('');
         setExecutionOutput('Kod je ispravljen. Možete ga ponovo pokrenuti.');

      }
    } catch (error) {
      console.error('Error during debugging:', error);
      setExecutionError(`Error during debugging: ${error.message}`);
    } finally {
      setIsLoadingDebugFix(false);
    }
  };
  
  const executeCode = async () => {
    if (!extractedCode) return;
    
    setIsRunning(true);
    setExecutionOutput('');
    setExecutionError('');
    setDebugResult(null);
    
    try {
      const result = await apiExecuteCode(extractedCode, languageType, sessionId);
      setSessionId(result.session_id);
      
      if (result.error) {
        setExecutionError(result.error);
      } else {
        setExecutionOutput(result.output || 'Izvršavanje uspješno.');
      }
      
    } catch (error) {
      console.error('Error executing code:', error);
      setExecutionError(`Error: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };
  
  useEffect(() => {
    let currentContent = '';
    let currentLanguage = 'text';
    let determinedViewType = ViewTypes.PLACEHOLDER;

    if (result?.session_id && !sessionId) {
        setSessionId(result.session_id);
    }

    if (result && result.workflowResult) {
      setIsWorkflowResult(true);
       const workflow = result.workflowResult;
       console.log("Processing workflow result:", workflow);

        let codeData = workflow.code || {};
        let execData = workflow.executionResult || {};
        let fixedExecData = workflow.fixedResult || {};

        currentLanguage = codeData.language || 'text';
        setLanguageType(currentLanguage);

        if (codeData.css) setExtractedCss(codeData.css);
        if (codeData.js) setExtractedJs(codeData.js);
        setFullStackCode(!!(codeData.css || codeData.js));

       if (codeData.fixed) {
         currentContent = codeData.fixed;
         setFixedCode(codeData.fixed);
         setOriginalCode(codeData.original || '');
         setShowOriginalCode(false);
       } else if (codeData.original) {
         currentContent = codeData.original;
         setOriginalCode(codeData.original);
       } else {
           currentContent = workflow.summary || JSON.stringify(workflow, null, 2);
           currentLanguage = 'text';
           setLanguageType(currentLanguage);
       }
       setExtractedCode(currentContent);

        if (fixedExecData.output || fixedExecData.error) {
            setExecutionOutput(fixedExecData.output || '');
            setExecutionError(fixedExecData.error || '');
            setDebugResult(null);
        } else if (execData.output || execData.error) {
            setExecutionOutput(execData.output || '');
            setExecutionError(execData.error || '');
            if (execData.debugResult) {
                setDebugResult(execData.debugResult);
            }
        }

    } else if (result && result.response) {
       setIsWorkflowResult(false);
      currentContent = result.response;

      const { code, language } = extractCodeBlocks(currentContent);
      setExtractedCode(code);
      setLanguageType(language);
      currentLanguage = language;
      currentContent = code;
       setExecutionOutput('');
       setExecutionError('');
       setDebugResult(null);

    }

    if (currentContent) {
       determinedViewType = detectViewType(currentContent, currentLanguage);

      if (determinedViewType === ViewTypes.TERMINAL) {
        const commands = generateTerminalCommands(currentContent, currentLanguage);
        setTerminalCommands(commands);
      } else if (determinedViewType === ViewTypes.WEB) {
        const preview = prepareWebPreview(currentContent, currentLanguage);
        setWebPreview(preview);
      }

      setViewType(determinedViewType);

    } else {
       setViewType(ViewTypes.PLACEHOLDER);
       setExtractedCode('');
       setLanguageType('text');
       setTerminalCommands([]);
       setWebPreview('');
       setExecutionOutput('');
       setExecutionError('');
       setDebugResult(null);
    }

  }, [result]);
  
  const prepareFullHtmlWithResources = (html, css, js) => {
    const isCompleteHtml = /<html|<!DOCTYPE html/i.test(html);
    
    if (isCompleteHtml) {
      let htmlWithResources = html;
      
      if (css && !htmlWithResources.includes(`<style>${css}</style>`)) {
        if (htmlWithResources.includes('</head>')) {
          htmlWithResources = htmlWithResources.replace('</head>', `<style>${css}</style></head>`);
        } else if (htmlWithResources.includes('<body>')) {
          htmlWithResources = htmlWithResources.replace('<body>', `<body><style>${css}</style>`);
        } else {
          htmlWithResources = `${htmlWithResources}<style>${css}</style>`;
        }
      }
      
      if (js && !htmlWithResources.includes(`<script>${js}</script>`)) {
        if (htmlWithResources.includes('</body>')) {
          htmlWithResources = htmlWithResources.replace('</body>', `<script>${js}</script></body>`);
        } else {
          htmlWithResources = `${htmlWithResources}<script>${js}</script>`;
        }
      }
      
      return htmlWithResources;
    } else {
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  ${css ? `<style>${css}</style>` : ''}
</head>
<body>
  ${html}
  ${js ? `<script>${js}</script>` : ''}
</body>
</html>`;
    }
  };
  
  useEffect(() => {
    if (viewType === ViewTypes.WEB && iframeRef.current && webPreview) {
      setTimeout(() => {
        const iframe = iframeRef.current;
         if (iframe && viewType === ViewTypes.WEB) {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            doc.open();
            doc.write(webPreview);
            doc.close();
        }
      }, 100);
    }
  }, [webPreview, viewType]);
  
  const renderTerminalView = () => {
    return (
      <div className="terminal-view h-full overflow-auto p-4 font-mono text-sm">
        <div className="terminal-window bg-gray-900 bg-opacity-70 rounded-lg overflow-hidden h-full flex flex-col">
          <div className="terminal-header px-4 py-2 border-b border-gray-800 flex items-center flex-shrink-0">
            <div className="mr-2 flex space-x-1.5">
              <div className="h-3 w-3 rounded-full bg-red-500"></div>
              <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
              <div className="h-3 w-3 rounded-full bg-green-500"></div>
            </div>
            <div className="text-xs text-gray-400">Terminal Simulation</div>
          </div>

          <div className="terminal-content p-3 text-gray-300 flex-grow overflow-y-auto">
            {terminalCommands.map((cmd, index) => (
              <div key={index} className="mb-2">
                {cmd.command.startsWith('#') ? (
                  <div className="text-gray-500 text-xs">{cmd.command}</div>
                ) : (
                  <div className="flex">
                     <span className="text-green-400 mr-1">$</span>
                     <span className="terminal-command flex-1">{cmd.command}</span>
                  </div>
                )}

                {cmd.output && (
                  <div className="terminal-output mt-1 text-gray-400 pl-2">{cmd.output}</div>
                )}
              </div>
            ))}
             {(executionOutput || executionError) && (
                 <div className="mt-4 pt-2 border-t border-gray-700">
                     <h4 className="text-xs text-gray-500 mb-1">Execution Result:</h4>
                     {executionOutput && <pre className="text-xs text-green-400 whitespace-pre-wrap">{executionOutput}</pre>}
                     {executionError && <pre className="text-xs text-red-400 whitespace-pre-wrap">{executionError}</pre>}
                 </div>
             )}
          </div>
        </div>
      </div>
    );
  };
  
  const renderWebView = () => {
    return (
      <div className="web-view h-full flex flex-col">
        <div className="web-header px-4 py-2 border-b border-gray-800 flex items-center flex-shrink-0">
          <div className="flex space-x-1.5 mr-4">
            <div className="h-3 w-3 rounded-full bg-red-500"></div>
            <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
            <div className="h-3 w-3 rounded-full bg-green-500"></div>
          </div>
          <div className="bg-gray-800 rounded px-3 py-1 text-xs text-gray-300 flex-grow mr-2">
            Preview
          </div>
           <button
                onClick={() => {
                    const blob = new Blob([webPreview], { type: 'text/html' });
                    const url = URL.createObjectURL(blob);
                    window.open(url, '_blank');
                    URL.revokeObjectURL(url);
                }}
                 className="px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-gray-300"
                 title="Open in new tab"
             >
                 <i className="fas fa-external-link-alt"></i>
             </button>
        </div>

        <div className="flex-grow overflow-hidden relative">
          <iframe
            ref={iframeRef}
            className="w-full h-full border-0 absolute top-0 left-0"
            sandbox="allow-scripts allow-same-origin allow-forms"
            title="Web Preview"
          ></iframe>
           {!webPreview && (
               <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-50 text-gray-400">
                   Loading preview...
               </div>
           )}
        </div>
         {(executionOutput || executionError) && (
             <div className="border-t border-gray-800 p-2 text-xs max-h-24 overflow-auto flex-shrink-0">
                 {executionOutput && <pre className="text-green-400 whitespace-pre-wrap">Output: {executionOutput}</pre>}
                 {executionError && <pre className="text-red-400 whitespace-pre-wrap">Error: {executionError}</pre>}
             </div>
         )}
      </div>
    );
  };
  
  const renderMonacoEditorView = () => {
    // Posebna obrada za workflow rezultat u JSON formatu
    if (isWorkflowResult && result?.workflowResult) {
      const workflowData = result.workflowResult;
      
      // Pripremamo lijep prikaz umjesto sirovog JSON-a
      let formattedContent = '';
      
      if (workflowData.initialResponse) {
        formattedContent += `# Početni odgovor agenta\n${workflowData.initialResponse}\n\n`;
      }
      
      if (workflowData.code) {
        formattedContent += `# Generirani kod\n\`\`\`${workflowData.code.language || 'text'}\n${workflowData.code.original || ''}\n\`\`\`\n\n`;
      }
      
      if (workflowData.executionResult) {
        formattedContent += `# Rezultat izvršavanja\n`;
        if (workflowData.executionResult.output) {
          formattedContent += `## Output\n\`\`\`\n${workflowData.executionResult.output}\n\`\`\`\n\n`;
        }
        if (workflowData.executionResult.error) {
          formattedContent += `## Greška\n\`\`\`\n${workflowData.executionResult.error}\n\`\`\`\n\n`;
        }
      }
      
      if (workflowData.message) {
        formattedContent += `# Status\n${workflowData.message}\n\n`;
      }
      
      if (workflowData.phase) {
        formattedContent += `# Faza\n${workflowData.phase}\n\n`;
      }
      
      if (workflowData.status) {
        formattedContent += `# Finalni status\n${workflowData.status}\n\n`;
      }
      
      // Ako nemamo nikakav formatiran sadržaj, koristimo cijeli JSON
      if (!formattedContent.trim()) {
        formattedContent = JSON.stringify(workflowData, null, 2);
      }
      
      // Postavimo formatirani sadržaj za prikaz
      if (formattedContent !== extractedCode) {
        setExtractedCode(formattedContent);
        setLanguageType('markdown');
      }
    }

    return (
      <div className="monaco-editor-view h-full flex flex-col">
         <div className="flex-grow relative">
             <CodeEditorComponent
              key={languageType}
              code={extractedCode || "// No code detected or generated yet."}
              language={languageType || "text"}
              onChange={(newCode) => setExtractedCode(newCode)}
              onLanguageChange={(newLanguage) => setLanguageType(newLanguage)}
              sessionId={sessionId}
              onExecute={async (codeToExecute, lang) => {
                 setIsRunning(true);
                 setExecutionOutput('');
                 setExecutionError('');
                 setDebugResult(null);
                 try {
                     const result = await apiExecuteCode(codeToExecute, lang, sessionId);
                     setSessionId(result.session_id);
                     if (result.error) {
                         setExecutionError(result.error);
                     } else {
                         setExecutionOutput(result.output || 'Execution successful.');
                     }
                 } catch (error) {
                     console.error('Error executing code from editor:', error);
                     setExecutionError(`Error: ${error.message}`);
                 } finally {
                     setIsRunning(false);
                 }
             }}
            />
        </div>

         <div className="flex-shrink-0 border-t border-gray-800">
            <div className="p-2 flex justify-between items-center flex-wrap gap-2 bg-gray-900/30">
                 <div className="flex items-center space-x-2">
                 <button
                     className={`px-3 py-1 rounded text-sm ${isRunning ? 'bg-gray-700 text-gray-400 cursor-wait' : 'bg-accent-green hover:bg-green-700 text-white'}`}
                     onClick={executeCode}
                     disabled={isRunning || !extractedCode}
                     title="Run the code in the editor"
                 >
                     {isRunning ? (
                     <span className="flex items-center">
                         <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                         <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                         <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                         </svg>
                         Running...
                     </span>
                     ) : (
                     <span className="flex items-center">
                         <svg className="mr-1 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
                         </svg>
                          Run Code
                     </span>
                     )}
                 </button>

                 {executionError && (
                     <button
                     className={`px-3 py-1 rounded text-sm ${isLoadingDebugFix ? 'bg-gray-700 text-gray-400 cursor-wait' : 'bg-accent-red hover:bg-red-700 text-white'}`}
                     onClick={debugCode}
                     disabled={isLoadingDebugFix || !executionError}
                     title="Attempt to automatically fix the execution error"
                     >
                     {isLoadingDebugFix ? (
                         <span className="flex items-center">
                         <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                           <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                           <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                         </svg>
                         Fixing...
                         </span>
                     ) : (
                         <span className="flex items-center">
                          <svg className="mr-1 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                         </svg>
                          Fix Errors
                         </span>
                     )}
                     </button>
                 )}
                 </div>

                 <div className="text-sm text-gray-400">
                 Language: <span className="text-accent-blue">{languageType}</span>
                 {fullStackCode && <span className="ml-2 px-2 py-0.5 rounded-full bg-gray-800 text-xs">Multi-file</span>}
                 </div>
             </div>

             {(executionOutput || executionError || debugResult) && (
                <div className="max-h-48 overflow-auto p-2 bg-gray-900/50 text-xs">
                 {executionError && !debugResult && (
                     <div className="bg-red-900 bg-opacity-20 border-l-2 border-red-500 p-2 rounded mb-1">
                     <pre className="text-red-300 whitespace-pre-wrap">{executionError}</pre>
                     </div>
                 )}

                 {executionOutput && !debugResult && (
                     <div className="bg-gray-800 bg-opacity-50 p-2 rounded mb-1">
                     <pre className="text-green-300 whitespace-pre-wrap">{executionOutput}</pre>
                     </div>
                 )}

                 {debugResult && (
                     <div className="bg-blue-900 bg-opacity-20 border-l-2 border-blue-500 p-2 rounded">
                     <h4 className="text-xs font-medium mb-1 text-blue-300">Debugger Suggestion:</h4>
                     <pre className="text-blue-200 whitespace-pre-wrap">{debugResult}</pre>
                     </div>
                 )}
                </div>
             )}
         </div>
      </div>
    );
  };
  
  const renderPlaceholder = () => {
       return (
           <div className="h-full flex items-center justify-center text-center p-6">
               <div>
                   <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                   </svg>
                   <h3 className="text-lg font-medium text-gray-400">Dynamic Workspace</h3>
                   <p className="mt-2 text-sm text-gray-500">
                       The workspace will activate here based on the agent's output (Code Editor, Terminal, Web Preview).
                   </p>
               </div>
           </div>
       );
   };

  return (
    <div style={workEnvironmentStyles.glassCard} className="h-full flex flex-col overflow-hidden">
      <div style={workEnvironmentStyles.dynamicContent}>
        {(() => {
          switch (viewType) {
            case ViewTypes.MONACO:
              return renderMonacoEditorView();
            case ViewTypes.TERMINAL:
              return renderTerminalView();
            case ViewTypes.WEB:
              return renderWebView();
            case ViewTypes.PLACEHOLDER:
            default:
              return renderPlaceholder();
          }
        })()}
      </div>
    </div>
  );
};

export default WorkEnvironment;