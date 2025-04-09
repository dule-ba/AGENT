import React, { useState, useEffect, useRef } from 'react';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-markup'; // Za HTML
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
  tabButton: {
    padding: '0.5rem 1rem',
    borderBottom: '2px solid transparent',
    color: '#a1a1aa',
    fontSize: '0.875rem',
    display: 'inline-flex',
    alignItems: 'center',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
  tabButtonActive: {
    color: '#f8fafc',
    borderBottomColor: '#3b82f6',
    fontWeight: '500',
  },
  tabsHeader: {
    flexShrink: 0,
    userSelect: 'none',
    borderBottom: '1px solid rgba(31, 41, 55, 1)',
    padding: '0 0.75rem',
  },
  tabContent: {
    height: '100%',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  },
  codeView: {
    height: '100%',
    width: '100%',
    overflow: 'auto',
  }
};

// Tip okruženja za prikaz
const ViewTypes = {
  CODE: 'code',
  TERMINAL: 'terminal',
  WEB: 'web',
  GUI: 'gui',
  MONACO: 'monaco'
};

const WorkEnvironment = ({ result }) => {
  const [viewType, setViewType] = useState(ViewTypes.CODE);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [extractedCode, setExtractedCode] = useState('');
  const [originalCode, setOriginalCode] = useState('');
  const [fixedCode, setFixedCode] = useState('');
  const [languageType, setLanguageType] = useState('python');
  const [terminalCommands, setTerminalCommands] = useState([]);
  const [webPreview, setWebPreview] = useState('');
  const [guiPreview, setGuiPreview] = useState(null);
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
  const [currentWorkflowPhase, setCurrentWorkflowPhase] = useState('');
  const [workflowOutputsGenerated, setWorkflowOutputsGenerated] = useState(false);
  const [activeTab, setActiveTab] = useState(ViewTypes.TERMINAL);
  const [webViewUrl, setWebViewUrl] = useState('http://localhost:3000');
  const [editorContent, setEditorContent] = useState('# Početni Python kod\nprint("Pozdrav iz Monaco Editora!")');
  const [editorLanguage, setEditorLanguage] = useState('python');
  const [editorOutput, setEditorOutput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  
  // Reference na iframe za simuliranje izvršavanja koda
  const iframeRef = useRef(null);
  const terminalRef = useRef(null);
  
  // Odredite najbolji tip prikaza na osnovu sadržaja
  const detectViewType = (content) => {
    if (!content) return ViewTypes.CODE;
    
    // Ako sadržaj eksplicitno sadrži Python sintaksu
    if (/def\s+\w+\s*\(|import\s+\w+|from\s+\w+\s+import|if\s+__name__\s*==\s*('|")__main__\1:|class\s+\w+\s*\(?\s*\w*\s*\)?:/i.test(content)) {
      // Ako također ima HTML tagove, daj prednost HTML-u osim ako kod nije očito Python
      if (/<html|<!DOCTYPE html/i.test(content)) {
        return ViewTypes.WEB;
      }
      return ViewTypes.TERMINAL;
    }
    
    // Ako sadržaj ima Tkinter import, vjerojatno je GUI aplikacija
    if (/import\s+tkinter|from\s+tkinter/i.test(content)) {
      return ViewTypes.GUI;
    }
    
    // Ako sadržaj ima HTML tagove, prikaži kao web
    if (/<\/?[a-z][\s\S]*>|<html|<!DOCTYPE html|<body|<head|<div|<span|<p|<a/i.test(content)) {
      return ViewTypes.WEB;
    }
    
    // Ako sadržaj ima linije koje počinju sa $, #, ili >, prikaži kao terminal
    if (/^[$#>].*$/m.test(content)) {
      return ViewTypes.TERMINAL;
    }
    
    // Default je prikaz koda
    return ViewTypes.CODE;
  };
  
  // Izvlači blokove koda iz sadržaja (poboljšana verzija)
  const extractCodeBlocks = (content) => {
    if (!content) return { code: '', language: 'text' };
    
    // Resetuj multi-file ekstrakciju
    setExtractedCss('');
    setExtractedJs('');
    setFullStackCode(false);
    
    // Pronađi sve code blokove u sadržaju
    const htmlBlockRegex = /```(?:html|markup)\n([\s\S]*?)\n```/gi;
    const cssBlockRegex = /```(?:css)\n([\s\S]*?)\n```/gi;
    const jsBlockRegex = /```(?:javascript|js)\n([\s\S]*?)\n```/gi;
    
    let htmlMatch = htmlBlockRegex.exec(content);
    let cssMatch = cssBlockRegex.exec(content);
    let jsMatch = jsBlockRegex.exec(content);
    
    let htmlCode = '';
    let cssCode = '';
    let jsCode = '';
    
    // Ekstrahiraj HTML blokove
    if (htmlMatch && htmlMatch[1]) {
      htmlCode = htmlMatch[1].trim();
    }
    
    // Ekstrahiraj CSS blokove
    if (cssMatch && cssMatch[1]) {
      cssCode = cssMatch[1].trim();
      setExtractedCss(cssCode);
    } else {
      // Pokušaj pronaći CSS unutar style tagova
      const styleTagRegex = /<style>([\s\S]*?)<\/style>/gi;
      const styleMatch = styleTagRegex.exec(content);
      if (styleMatch && styleMatch[1]) {
        cssCode = styleMatch[1].trim();
        setExtractedCss(cssCode);
      }
    }
    
    // Ekstrahiraj JavaScript blokove
    if (jsMatch && jsMatch[1]) {
      jsCode = jsMatch[1].trim();
      setExtractedJs(jsCode);
    } else {
      // Pokušaj pronaći JavaScript unutar script tagova
      const scriptTagRegex = /<script>([\s\S]*?)<\/script>/gi;
      const scriptMatch = scriptTagRegex.exec(content);
      if (scriptMatch && scriptMatch[1]) {
        jsCode = scriptMatch[1].trim();
        setExtractedJs(jsCode);
      }
    }
    
    // Ako nemamo direktan HTML blok, ali imamo sadržaj sa HTML tagovima
    if (!htmlCode && /<html|<!DOCTYPE html/i.test(content)) {
      // Provjeri da li sadržaj izgleda kao kompletan HTML dokument
      if (/<html|<!DOCTYPE html/i.test(content)) {
        htmlCode = content;
        
        // Ako nemamo već ekstrahiran CSS, pokušaj ga izvući iz HTML-a
        if (!cssCode) {
          const styleTagRegex = /<style>([\s\S]*?)<\/style>/gi;
          let styleMatch;
          while ((styleMatch = styleTagRegex.exec(content)) !== null) {
            cssCode += styleMatch[1].trim() + "\n";
          }
          if (cssCode) {
            setExtractedCss(cssCode);
          }
        }
        
        // Ako nemamo već ekstrahiran JS, pokušaj ga izvući iz HTML-a
        if (!jsCode) {
          const scriptTagRegex = /<script>([\s\S]*?)<\/script>/gi;
          let scriptMatch;
          while ((scriptMatch = scriptTagRegex.exec(content)) !== null) {
            jsCode += scriptMatch[1].trim() + "\n";
          }
          if (jsCode) {
            setExtractedJs(jsCode);
          }
        }
      } else {
        // Ako sadržaj sadrži HTML tagove ali nije kompletan dokument
        htmlCode = content;
      }
    }
    
    // Označi da imamo više fajlova ako imamo i HTML i (CSS ili JS)
    if (htmlCode && (cssCode || jsCode)) {
      setFullStackCode(true);
    }
    
    // Ako imamo HTML kod, vrati ga kao primarni
    if (htmlCode) {
      return { code: htmlCode, language: 'markup' };
    }
    
    // Pokušaj naći kod unutar markdown code blokova (za ostale jezike)
    const codeBlockRegex = /```([a-z]*)\n([\s\S]*?)\n```/i;
    const match = content.match(codeBlockRegex);
    
    if (match) {
      let language = match[1].trim() || 'python';
      // Normalizacija jezika za Prism
      if (language === 'js') language = 'javascript';
      if (language === 'py') language = 'python';
      if (language === 'html' || language === 'markup') language = 'markup';
      
      return { 
        code: match[2], 
        language 
      };
    }
    
    // Potraži redove koji izgledaju kao kod
    const codePatterns = {
      python: /^(def|class|import|from|if|for|while)\s+.+:/m,
      javascript: /^(const|let|var|function|class|import)\s+.+/m,
      markup: /<\/?[a-z][\s\S]*>/i,
      css: /\s*\{\s*[\s\S]*?\s*\}/m,
      sql: /SELECT|FROM|WHERE|INSERT|UPDATE|DELETE/i,
    };
    
    for (const [lang, pattern] of Object.entries(codePatterns)) {
      if (pattern.test(content)) {
        return { 
          code: content, 
          language: lang 
        };
      }
    }
    
    return { code: content, language: 'text' };
  };
  
  // Generiranje odgovarajućih terminalnih komandi
  const generateTerminalCommands = (code, language) => {
    const commands = [];
    
    if (language === 'python') {
      // Kreiraj Python fajl
      commands.push({
        command: '# Kreiranje Python fajla',
        output: ''
      });
      
      commands.push({
        command: '$ echo "' + code.replace(/"/g, '\\"').substring(0, 100) + '..." > app.py',
        output: ''
      });
      
      // Pokreni Python skriptu
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
      // Kreiraj JS fajl
      commands.push({
        command: '# Kreiranje JavaScript fajla',
        output: ''
      });
      
      commands.push({
        command: '$ echo "' + code.replace(/"/g, '\\"').substring(0, 100) + '..." > app.js',
        output: ''
      });
      
      // Pokreni JS skriptu
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
    }
    
    return commands;
  };
  
  // Pripremi HTML prikaz za Web tab
  const prepareWebPreview = (code, language) => {
    if (language === 'markup' || language === 'html') {
      // Provjeri da li je kod kompletan HTML dokument
      const isCompleteHtml = /<html|<!DOCTYPE html/i.test(code);
      
      if (isCompleteHtml) {
        // Ako je kompletan HTML, provjeri da li sadrži CSS i JS
        let htmlWithResources = code;
        
        // Ako imamo ekstrahovani CSS, a HTML ga već ne sadrži, dodaj ga
        if (extractedCss && !htmlWithResources.includes(`<style>${extractedCss}</style>`)) {
          htmlWithResources = htmlWithResources.replace('</head>', `<style>${extractedCss}</style></head>`);
        }
        
        // Ako imamo ekstrahovani JS, a HTML ga već ne sadrži, dodaj ga
        if (extractedJs && !htmlWithResources.includes(`<script>${extractedJs}</script>`)) {
          htmlWithResources = htmlWithResources.replace('</body>', `<script>${extractedJs}</script></body>`);
        }
        
        return htmlWithResources;
      } else {
        // Ako nije kompletan HTML, kreiraj osnovnu strukturu
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>To-Do Aplikacija</title>
  ${extractedCss ? `<style>${extractedCss}</style>` : ''}
</head>
<body>
  ${code}
  ${extractedJs ? `<script>${extractedJs}</script>` : ''}
</body>
</html>`;
      }
    } else if (language === 'python') {
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
  
  // Pošalji kod debugger agentu i prikaži rezultat
  const debugCode = async () => {
    if (!extractedCode || !executionError) return;
    
    setIsLoadingDebugFix(true);
    
    try {
      // Pripremi poruku s kodom i greškom
      const debugMessage = `Debug ovaj kod i ispravi sve greške. Niže je kod i greška koja se dogodi pri izvršavanju:
      
KOD:
\`\`\`${languageType}
${extractedCode}
\`\`\`

GREŠKA:
${executionError}

Molim te vrati kompletan kod s ispravkama, objasni šta je bio problem, i šta si promijenio.`;
      
      // Pošalji poruku debugger agentu
      const result = await sendChatMessage(debugMessage, 'debugger');
      
      // Postavi rezultat za prikaz
      setDebugResult(result.response);
      
      // Pokušaj ekstraktirati ispravljeni kod iz odgovora debugger agenta
      const fixedCodeMatch = result.response.match(/```(?:[a-z]*)\n([\s\S]*?)\n```/i);
      if (fixedCodeMatch && fixedCodeMatch[1]) {
        // Postavi ispravljeni kod
        setExtractedCode(fixedCodeMatch[1]);
      }
    } catch (error) {
      console.error('Error during debugging:', error);
      setExecutionError(`Error during debugging: ${error.message}`);
    } finally {
      setIsLoadingDebugFix(false);
    }
  };
  
  // Izvršavanje koda
  const executeCode = async () => {
    if (!extractedCode) return;
    
    setIsRunning(true);
    setExecutionOutput('');
    setExecutionError('');
    setDebugResult(null);
    
    try {
      const result = await apiExecuteCode(extractedCode, languageType);
      
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
  
  // Handler za prebacivanje između tab-ova
  const handleViewChange = (newViewType) => {
    setViewType(newViewType);
    
    // Ako je odabran web pregled, pripremi HTML
    if (newViewType === ViewTypes.WEB) {
      // Osvježi iframe sadržaj
      setTimeout(() => {
        if (iframeRef.current) {
          const iframe = iframeRef.current;
          const doc = iframe.contentDocument || iframe.contentWindow.document;
          doc.open();
          doc.write(webPreview);
          doc.close();
        }
      }, 100);
    }
  };
  
  // Posebna obrada za workflow rezultate
  useEffect(() => {
    if (result && result.workflowResult) {
      setIsWorkflowResult(true);
      processWorkflowResult(result.workflowResult);
    } else {
      setIsWorkflowResult(false);
      if (result && result.response) {
        processStandardResult(result.response);
      }
    }
  }, [result]);
  
  // Obrada rezultata workflow-a
  const processWorkflowResult = (workflow) => {
    if (!workflow) return;
    console.log("Processing workflow result:", workflow);
    
    setWorkflowOutputsGenerated(false);
    
    // Tip odgovora iz workflowa (defaultno "code" ako nije postavljen)
    const responseType = workflow.type || 'code';
    
    // Automatski prebaci na odgovarajući view ovisno o tipu odgovora
    if (responseType === 'text' || responseType === 'plan') {
      setViewType(ViewTypes.CODE);
    } else if (responseType === 'code') {
      // Za HTML/web kod prikaži web pregled, inače terminal
      const codeLanguage = workflow.code?.language || 'text';
      if (codeLanguage === 'html' || codeLanguage === 'markup' || /<html|<!DOCTYPE html/i.test(workflow.code?.original || '')) {
        setViewType(ViewTypes.WEB);
      } else {
        setViewType(ViewTypes.TERMINAL);
      }
    }
    
    // Postavljanje koda iz workflow-a
    if (workflow.code && workflow.code.original) {
      setOriginalCode(workflow.code.original);
      setLanguageType(workflow.code?.language || 'text');
    }
    
    // Postavljanje CSS i JS iz workflow-a
    if (workflow.code && workflow.code.css) {
      setExtractedCss(workflow.code.css);
    }
    
    if (workflow.code && workflow.code.js) {
      setExtractedJs(workflow.code.js);
    }
    
    // Postavi fullStackCode na true ako imamo i CSS i/ili JS
    if ((workflow.code && workflow.code.css) || (workflow.code && workflow.code.js)) {
      setFullStackCode(true);
    }
    
    if (workflow.code && workflow.code.fixed) {
      setFixedCode(workflow.code.fixed);
      setExtractedCode(workflow.code.fixed);
      setShowOriginalCode(false);
    } else if (workflow.code && workflow.code.original) {
      setExtractedCode(workflow.code.original);
    }
    
    // Postavljanje izlaza iz workflow-a
    if (workflow.executionResult) {
      if (workflow.executionResult.error) {
        setExecutionError(workflow.executionResult.error);
        setExecutionOutput('');
      } else {
        setExecutionOutput(workflow.executionResult.output || 'Izvršavanje uspješno.');
        setExecutionError('');
      }
      
      if (workflow.executionResult.debugResult) {
        setDebugResult(workflow.executionResult.debugResult);
      }
    }
    
    // Postavljanje fiksiranog izlaza iz workflow-a
    if (workflow.fixedResult) {
      if (!workflow.fixedResult.error) {
        setExecutionOutput(workflow.fixedResult.output || 'Izvršavanje ispravljenog koda uspješno.');
        setExecutionError('');
      } else {
        setExecutionError(workflow.fixedResult.error);
      }
    }
    
    // Detektiraj najbolji tip prikaza na osnovu koda i rezultata
    let codeContent = workflow.code ? workflow.code.fixed || workflow.code.original : '';
    if (codeContent) {
      // Provjeri sadržaj i eksplicitno odredi tip prikaza
      const bestViewType = detectViewType(codeContent);
      
      // Ako je kod HTML/markup, daj prednost web pregledu
      if (workflow.code.language === 'html' || workflow.code.language === 'markup' ||
          /<html|<!DOCTYPE html/i.test(codeContent)) {
        setViewType(ViewTypes.WEB);
      } else if (bestViewType !== ViewTypes.CODE) {
        // Koristi detektirani tip ako nije defaultni
        setViewType(bestViewType);
      }
      
      // Pripremi terminal komande
      const commands = generateTerminalCommands(codeContent, workflow.code.language || 'text');
      setTerminalCommands(commands);
      
      // Pripremi web preview - dodaj CSS i JavaScript ako postoje
      let preview;
      if (workflow.code.language === 'html' || workflow.code.language === 'markup' ||
          /<html|<!DOCTYPE html/i.test(codeContent)) {
        // Pripremi puni HTML sa CSS-om i JavaScript-om
        preview = prepareFullHtmlWithResources(codeContent, workflow.code.css, workflow.code.js);
      } else {
        preview = prepareWebPreview(codeContent, workflow.code.language || 'text');
      }
      setWebPreview(preview);
      
      // Postavi prikaz radnog okruženja
      setShowWorkspace(true);
      setWorkflowOutputsGenerated(true);
    }
  };
  
  // Pomoćna funkcija za kreiranje potpunog HTML-a s CSS-om i JavaScript-om
  const prepareFullHtmlWithResources = (html, css, js) => {
    // Provjeri da li je HTML kompletan dokument
    const isCompleteHtml = /<html|<!DOCTYPE html/i.test(html);
    
    if (isCompleteHtml) {
      // Ako je kompletan HTML, provjeri da li već sadrži style i script
      let htmlWithResources = html;
      
      // Dodaj CSS ako ga HTML već ne sadrži
      if (css && !htmlWithResources.includes(`<style>${css}</style>`)) {
        // Ako postoji </head> tag, dodaj CSS prije njega
        if (htmlWithResources.includes('</head>')) {
          htmlWithResources = htmlWithResources.replace('</head>', `<style>${css}</style></head>`);
        } 
        // Inače, dodaj na početak body ili na kraj html-a
        else if (htmlWithResources.includes('<body>')) {
          htmlWithResources = htmlWithResources.replace('<body>', `<body><style>${css}</style>`);
        } else {
          htmlWithResources = `${htmlWithResources}<style>${css}</style>`;
        }
      }
      
      // Dodaj JavaScript ako ga HTML već ne sadrži
      if (js && !htmlWithResources.includes(`<script>${js}</script>`)) {
        // Ako postoji </body> tag, dodaj JavaScript prije njega
        if (htmlWithResources.includes('</body>')) {
          htmlWithResources = htmlWithResources.replace('</body>', `<script>${js}</script></body>`);
        } 
        // Inače, dodaj na kraj html-a
        else {
          htmlWithResources = `${htmlWithResources}<script>${js}</script>`;
        }
      }
      
      return htmlWithResources;
    } else {
      // Ako nije kompletan HTML, kreiraj osnovnu strukturu
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>To-Do Aplikacija</title>
  ${css ? `<style>${css}</style>` : ''}
</head>
<body>
  ${html}
  ${js ? `<script>${js}</script>` : ''}
</body>
</html>`;
    }
  };
  
  // Obrada standardnog rezultata (direktan odgovor od agenta)
  const processStandardResult = (content) => {
    if (!content) return;
    
    // Detektiraj najbolji tip prikaza
    const bestViewType = detectViewType(content);
    setViewType(bestViewType);
    
    // Izvuci kod i odredi jezik
    const { code, language } = extractCodeBlocks(content);
    setExtractedCode(code);
    setLanguageType(language);
    
    // Generiraj terminalne komande ako je potrebno
    if (bestViewType === ViewTypes.TERMINAL || language === 'bash') {
      const commands = generateTerminalCommands(code, language);
      setTerminalCommands(commands);
    }
    
    // Pripremi web preview ako je potrebno
    if (bestViewType === ViewTypes.WEB || language === 'html' || language === 'markup') {
      const preview = prepareWebPreview(code, language);
      setWebPreview(preview);
    }
    
    // Prikaži radno okruženje
    setShowWorkspace(shouldShowWorkspace(content, result));
  };
  
  // Osvježi Prism highlight nakon što se sadržaj promijeni
  useEffect(() => {
      Prism.highlightAll();
  }, [extractedCode, languageType, showOriginalCode]);
  
  // Osvježi iframe kada se promijeni webPreview
  useEffect(() => {
    if (viewType === ViewTypes.WEB && iframeRef.current && webPreview) {
      setTimeout(() => {
        const iframe = iframeRef.current;
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(webPreview);
        doc.close();
      }, 100);
    }
  }, [webPreview, viewType]);
  
  // Prikaži sadržaj ovisno o tipu prikaza
  const getContent = () => {
    switch (viewType) {
      case ViewTypes.CODE:
        return renderCodeView();
      case ViewTypes.TERMINAL:
        return renderTerminalView();
      case ViewTypes.WEB:
        return renderWebView();
      case ViewTypes.GUI:
        return renderGuiView();
      case ViewTypes.MONACO:
        return renderMonacoEditorView();
      default:
        return renderCodeView();
    }
  };
  
  // Odluči da li treba prikazati radno okruženje
  const shouldShowWorkspace = (content, result) => {
    if (!content) return false;
    
    // Prikaži ako postoji kod
    if (/```[a-z]*\n[\s\S]*?\n```/i.test(content)) return true;
    
    // Prikaži ako ima HTML
    if (/<\/?[a-z][\s\S]*>/i.test(content)) return true;
    
    // Prikaži ako ima terminalne komande
    if (/^[$#>].*$/m.test(content)) return true;
    
    // Prikaži ako je executor preusmjerio na code ili debugger agenta
    if (result && result.flow && Array.isArray(result.flow)) {
      return result.flow.some(agent => 
        agent.toLowerCase() === 'code' || 
        agent.toLowerCase() === 'debugger'
      );
    }
    
    return false;
  };
  
  // Render funkcija za pregled koda
  const renderCodeView = () => {
    return (
      <div className="code-view h-full">
        <div className="flex flex-col h-full">
          {/* Code Editor */}
          <div className="flex-grow overflow-auto relative p-4">
            <pre className="language-codeblock language-none">
              <code className={`language-${languageType}`}>{extractedCode}</code>
            </pre>
          </div>
          
          {/* Kontrole i gumbi */}
          <div className="p-3 border-t border-gray-800 flex justify-between items-center flex-wrap gap-2">
            <div className="flex items-center space-x-2">
              <button 
                className={`px-3 py-1 rounded text-sm ${isRunning ? 'bg-gray-700 text-gray-400 cursor-wait' : 'bg-accent-green hover:bg-green-700 text-white'}`}
                onClick={executeCode}
                disabled={isRunning || !extractedCode}
              >
                {isRunning ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Izvršavanje...
                  </span>
                ) : (
                  <span className="flex items-center">
                    <svg className="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Pokreni kod
                  </span>
                )}
              </button>
              
              {executionError && (
                <button 
                  className={`px-3 py-1 rounded text-sm ${isLoadingDebugFix ? 'bg-gray-700 text-gray-400 cursor-wait' : 'bg-accent-red hover:bg-red-700 text-white'}`}
                  onClick={debugCode}
                  disabled={isLoadingDebugFix || !executionError}
                >
                  {isLoadingDebugFix ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Ispravljanje...
                    </span>
                  ) : (
                    <span className="flex items-center">
                      <svg className="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                      Ispravi greške
                    </span>
                  )}
                </button>
              )}
            </div>
            
            <div className="text-sm text-gray-400">
              Jezik: <span className="text-accent-blue">{languageType}</span>
              {fullStackCode && <span className="ml-2 px-2 py-0.5 rounded-full bg-gray-800 text-xs">Multi-file</span>}
            </div>
          </div>
          
          {/* Output prozor */}
          {(executionOutput || executionError || debugResult) && (
            <div className="border-t border-gray-800 max-h-64 overflow-auto">
              <div className="p-3">
                <h3 className="text-sm font-medium mb-2">
                  {debugResult ? "Debug rezultat:" : "Rezultat izvršavanja:"}
                </h3>
                
                {executionError && !debugResult && (
                  <div className="bg-red-900 bg-opacity-20 border-l-2 border-red-500 p-3 rounded mb-3">
                    <pre className="text-xs text-red-400 whitespace-pre-wrap">{executionError}</pre>
                  </div>
                )}
                
                {executionOutput && !debugResult && (
                  <div className="bg-gray-900 bg-opacity-50 p-3 rounded mb-3">
                    <pre className="text-xs text-green-400 whitespace-pre-wrap">{executionOutput}</pre>
                  </div>
                )}
                
                {debugResult && (
                  <div className="bg-blue-900 bg-opacity-20 border-l-2 border-blue-500 p-3 rounded">
                    <pre className="text-xs text-blue-300 whitespace-pre-wrap">{debugResult}</pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };
  
  // Render funkcija za prikaz terminala
  const renderTerminalView = () => {
    return (
      <div className="terminal-view h-full overflow-auto p-4 font-mono text-sm">
        <div className="terminal-window bg-gray-900 bg-opacity-70 rounded-lg overflow-hidden">
          <div className="terminal-header px-4 py-2 border-b border-gray-800 flex items-center">
            <div className="mr-2 flex space-x-1.5">
              <div className="h-3 w-3 rounded-full bg-red-500"></div>
              <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
              <div className="h-3 w-3 rounded-full bg-green-500"></div>
            </div>
            <div className="text-xs text-gray-400">Terminal</div>
          </div>
          
          <div className="terminal-content p-3 text-gray-300">
            {terminalCommands.map((cmd, index) => (
              <div key={index} className="mb-2">
                {cmd.command.startsWith('#') ? (
                  <div className="text-gray-500 text-xs">{cmd.command}</div>
                ) : (
                  <div className="terminal-command">{cmd.command}</div>
                )}
                
                {cmd.output && (
                  <div className="terminal-output mt-1 text-gray-400">{cmd.output}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };
  
  // Render funkcija za web prikaz
  const renderWebView = () => {
    return (
      <div className="web-view h-full flex flex-col">
        <div className="web-header px-4 py-2 border-b border-gray-800 flex items-center">
          <div className="flex space-x-1.5 mr-4">
            <div className="h-3 w-3 rounded-full bg-red-500"></div>
            <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
            <div className="h-3 w-3 rounded-full bg-green-500"></div>
          </div>
          <div className="bg-gray-800 rounded px-3 py-1 text-xs text-gray-300 flex-grow">
            localhost:3000
          </div>
        </div>
        
        <div className="flex-grow overflow-hidden">
          <iframe 
            ref={iframeRef}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin"
            srcDoc={webPreview}
            title="Web Preview"
          ></iframe>
        </div>
      </div>
    );
  };
  
  // Render funkcija za GUI prikaz
  const renderGuiView = () => {
    return (
      <div className="gui-view h-full flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-400 mb-2">GUI Aplikacija</h3>
          <p className="text-sm text-gray-500 mb-4">
            Ova aplikacija sadrži GUI komponente koje se ne mogu prikazati direktno u web interfejsu.
          </p>
          
          <button 
            className="px-4 py-2 bg-accent-blue hover:bg-blue-700 text-white rounded text-sm transition-colors"
            onClick={executeCode}
          >
            {isRunning ? 'Pokretanje...' : 'Pokreni aplikaciju'}
          </button>
          
          <p className="mt-4 text-xs text-gray-500">
            Napomena: Pokretanje GUI aplikacija zahtijeva izvršavanje na serveru sa grafičkim okruženjem.
          </p>
        </div>
      </div>
    );
  };

  // Render funkcija za Monaco Editor
  const renderMonacoEditorView = () => {
    return (
      <div className="monaco-editor-view h-full">
        <CodeEditorComponent 
          code={extractedCode || "// Unesite kod ovdje"}
          language={languageType || "javascript"}
          onChange={(newCode) => setExtractedCode(newCode)}
          onLanguageChange={(newLanguage) => setLanguageType(newLanguage)}
          sessionId={sessionId}
          onExecute={(result) => {
            if (result.output) setExecutionOutput(result.output);
            if (result.error) setExecutionError(result.error);
          }}
        />
      </div>
    );
  };

  if (!showWorkspace) {
    return (
      <div className="glass-card h-full flex items-center justify-center text-center p-6">
        <div>
          <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
          </svg>
          <h3 className="text-lg font-medium text-gray-400">Radno okruženje</h3>
          <p className="mt-2 text-sm text-gray-500">
            Radno okruženje će se aktivirati kada sadržaj zahtijeva prikaz koda, terminala ili web preglednika.
            Koristite specijalizirane upite za aktiviranje različitih radnih okruženja.
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div style={workEnvironmentStyles.glassCard} className="h-full flex flex-col overflow-hidden">
      {/* Tab navigacija */}
      <div style={workEnvironmentStyles.tabsHeader} className="flex overflow-x-auto">
        <button
          onClick={() => setViewType(ViewTypes.CODE)}
          style={{
            ...workEnvironmentStyles.tabButton,
            ...(viewType === ViewTypes.CODE ? workEnvironmentStyles.tabButtonActive : {})
          }}
          className="hover:bg-white/5"
        >
          <i className="fas fa-code mr-2"></i> Kod
        </button>
        <button
          onClick={() => setViewType(ViewTypes.TERMINAL)}
          style={{
            ...workEnvironmentStyles.tabButton,
            ...(viewType === ViewTypes.TERMINAL ? workEnvironmentStyles.tabButtonActive : {})
          }}
          className="hover:bg-white/5"
        >
          <i className="fas fa-terminal mr-2"></i> Terminal
        </button>
        <button
          onClick={() => setViewType(ViewTypes.WEB)}
          style={{
            ...workEnvironmentStyles.tabButton,
            ...(viewType === ViewTypes.WEB ? workEnvironmentStyles.tabButtonActive : {})
          }}
          className="hover:bg-white/5"
        >
          <i className="fas fa-globe mr-2"></i> Web
        </button>
        <button
          onClick={() => setViewType(ViewTypes.GUI)}
          style={{
            ...workEnvironmentStyles.tabButton,
            ...(viewType === ViewTypes.GUI ? workEnvironmentStyles.tabButtonActive : {})
          }}
          className="hover:bg-white/5"
        >
          <i className="fas fa-desktop mr-2"></i> GUI
        </button>
        <button
          onClick={() => setViewType(ViewTypes.MONACO)}
          style={{
            ...workEnvironmentStyles.tabButton,
            ...(viewType === ViewTypes.MONACO ? workEnvironmentStyles.tabButtonActive : {})
          }}
          className="hover:bg-white/5"
        >
          <i className="fas fa-edit mr-2"></i> Editor
        </button>
      </div>

      {/* Tab sadržaj */}
      <div style={workEnvironmentStyles.tabContent}>
        {viewType === ViewTypes.CODE && renderCodeView()}
        {viewType === ViewTypes.TERMINAL && renderTerminalView()}
        {viewType === ViewTypes.WEB && renderWebView()}
        {viewType === ViewTypes.GUI && renderGuiView()}
        {viewType === ViewTypes.MONACO && renderMonacoEditorView()}
      </div>

      {/* Kontrole za izvršavanje */}
      <div className="border-t border-gray-800 p-2 flex justify-between items-center bg-gray-900/50">
        {/* ... existing code ... */}
      </div>
    </div>
  );
};

export default WorkEnvironment;