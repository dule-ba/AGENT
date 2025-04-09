// API klijent za komunikaciju s backend servisom

const API_BASE_URL = 'http://localhost:8000';

// Lokalna varijabla za praćenje session_id-a
let currentSessionId = localStorage.getItem('current_session_id') || null;

// Postavi sesiju pri pokretanju
console.log(`Inicijalna sesija: ${currentSessionId || 'nova sesija'}`);

// Glavni API poziv za komunikaciju s agentima
export const sendChatMessage = async (message, agent = 'executor', options = {}) => {
  const { model = 'default', temperature = 0.7, mcpServer = 'anthropic', auto_process = true } = options;
  
  try {
    console.log(`Šaljem poruku sa ID sesije: ${currentSessionId || 'nova sesija'}`);
    
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        agent,
        auto_process,
        model,
        temperature,
        mcp_server: mcpServer,
        session_id: currentSessionId // Pošalji postojeći session_id ako postoji
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const result = await response.json();
    
    // Spremi session_id za buduće pozive
    if (result.session_id) {
      currentSessionId = result.session_id;
      // Sačuvaj sesiju u localStorage za perzistentnost između ponovnih učitavanja stranice
      localStorage.setItem('current_session_id', currentSessionId);
      console.log(`Sesija aktivna: ${currentSessionId}`);
    }

    return result;
  } catch (error) {
    console.error('Error sending chat message:', error);
    throw error;
  }
};

// Izvršavanje koda s automatskim ispravljanjem grešaka
export const executeCode = async (code, language, mode = 'script', sessionId = null, options = {}) => {
  const { autoDebug = true, mcpServer = 'anthropic' } = options;
  
  try {
    // Koristi trenutni session ID ili onaj koji je prosljeđen
    const activeSessionId = sessionId || currentSessionId;
    
    const response = await fetch(`${API_BASE_URL}/execute-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        language,
        mode,
        sessionId: activeSessionId,
        auto_debug: autoDebug, // Za automatsko pokretanje debug procesa ako se pojavi greška
        mcp_server: mcpServer
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const result = await response.json();
    
    // Automatski pokretanje debug agenta ako postoji greška i autoDebug je uključen
    if (result.error && autoDebug) {
      console.log('Detektovana greška, proslijeđujem debugger agentu...');
      try {
        const debugResult = await sendChatMessage(
          `Debug ovaj kod i ispravi sve greške: \n\`\`\`${language}\n${code}\n\`\`\`\n\nGREŠKA:\n${result.error}`,
          'debugger',
          { mcpServer }
        );
        
        // Dodaj informaciju o izvornoj grešci i rezultatu debuga
        return {
          ...result,
          debugResult: debugResult.response,
          wasDebugAttempted: true
        };
      } catch (debugError) {
        console.error('Error during auto-debug:', debugError);
        return {
          ...result,
          wasDebugAttempted: true,
          debugError: debugError.message
        };
      }
    }

    return result;
  } catch (error) {
    console.error('Error executing code:', error);
    throw error;
  }
};

// API poziv za izvršavanje lanca operacija (code -> execute -> debug -> web preview)
export const executeWorkflow = async (message, options = {}) => {
  const { 
    model = 'default', 
    temperature = 0.7, 
    agent = 'code', 
    mcpServer = 'anthropic',
    workflowType = 'code'
  } = options;
  
  try {
    // Korak 1: Generisanje koda
    console.log(`Pokretanje workflow-a: ${workflowType} koristeći ${mcpServer} MCP sa agentom: ${agent}`);
    
    // Osnovni odgovor od početnog agenta
    const codeResult = await sendChatMessage(
      message, 
      agent,
      { model, temperature, mcpServer }
    );
    
    // Ako nema ispravnog odgovora, vrati trenutni rezultat
    if (!codeResult.response) {
      return { 
        status: 'error', 
        message: 'Nema odgovora od agenta', 
        phase: 'initial_response', 
        result: codeResult 
      };
    }
    
    // Sačuvaj originalni prompt za kasnije rerun-ove
    const originalPrompt = message;
    
    // Provjeri tip odgovora - ako nije code, vrati direktno
    if (codeResult.type && codeResult.type !== 'code') {
      return { 
        status: 'completed', 
        message: 'Uspješno generisan odgovor', 
        phase: 'text_response',
        codeResult: codeResult,
        originalPrompt,
        type: codeResult.type 
      };
    }
    
    // Ekstrahiraj odvojene blokove koda (HTML, CSS, JavaScript)
    const extractedBlocks = extractCodeBlocks(codeResult.response);
    
    if (!extractedBlocks.htmlCode && !extractedBlocks.originalCode) {
      return { 
        status: 'completed', 
        message: 'Kod nije pronađen u odgovoru, ali vraćam rezultat', 
        phase: 'code_generation',
        result: codeResult,
        originalPrompt 
      };
    }
    
    // Odredi primarni kod za izvršavanje i jezik
    let primaryCode = extractedBlocks.htmlCode || extractedBlocks.originalCode;
    
    // Detektiraj jezik na osnovu sadržaja ako nije eksplicitno naveden
    let language = extractedBlocks.language || detectLanguage(primaryCode);
    
    // Ako imamo HTML kod i još neki drugi resurs, koristimo HTML za izvršavanje
    if (extractedBlocks.htmlCode && (extractedBlocks.cssCode || extractedBlocks.jsCode)) {
      // Pripremi kompletan HTML kod s ugrađenim CSS-om i JavaScript-om
      primaryCode = prepareFullHtmlCode(extractedBlocks.htmlCode, extractedBlocks.cssCode, extractedBlocks.jsCode);
      language = 'html';
    }
    
    // Korak 2: Izvršavanje koda
    console.log(`Izvršavanje koda (${language})...`);
    const executionResult = await executeCode(
      primaryCode, 
      language, 
      'script', 
      null, 
      { 
        autoDebug: workflowType !== 'no_debug',
        mcpServer
      }
    );
    
    // Korak 3: Ako je bilo grešaka i izvršen je debug, pokušaj ponovo izvršiti kod
    if (executionResult.error && executionResult.debugResult) {
      console.log('Pokušavam izvršiti ispravljeni kod nakon debugiranja...');
      
      // Ekstrahiraj ponovo sve blokove iz debug rezultata
      const fixedBlocks = extractCodeBlocks(executionResult.debugResult);
      let fixedCode = fixedBlocks.htmlCode || fixedBlocks.originalCode;
      
      // Ako imamo HTML i druge resurse, pripremi kompletan kod
      if (fixedBlocks.htmlCode && (fixedBlocks.cssCode || fixedBlocks.jsCode)) {
        fixedCode = prepareFullHtmlCode(fixedBlocks.htmlCode, fixedBlocks.cssCode, fixedBlocks.jsCode);
      }
      
      if (fixedCode) {
        console.log('Izvršavanje ispravljenog koda...');
        
        // Izvršavanje ispravljenog koda
        const fixedResult = await executeCode(
          fixedCode, 
          language, 
          'script', 
          null, 
          { autoDebug: false, mcpServer }
        );
        
        return {
          status: 'completed',
          message: 'Workflow završen s debugiranjem',
          phase: 'execution_fixed',
          codeResult,
          executionResult,
          fixedResult,
          code: {
            original: primaryCode,
            fixed: fixedCode,
            language,
            css: extractedBlocks.cssCode || fixedBlocks.cssCode,
            js: extractedBlocks.jsCode || fixedBlocks.jsCode
          },
          originalPrompt,
          mcpServer
        };
      }
    }
    
    // Vrati rezultate svih faza
    return {
      status: 'completed',
      message: 'Workflow završen',
      phase: executionResult.error ? 'execution_error' : 'execution_success',
      codeResult,
      executionResult,
      code: {
        original: primaryCode,
        language,
        css: extractedBlocks.cssCode,
        js: extractedBlocks.jsCode
      },
      originalPrompt,
      mcpServer
    };
  } catch (error) {
    console.error('Error in workflow execution:', error);
    return {
      status: 'error',
      message: `Greška tijekom izvršavanja workflow-a: ${error.message}`,
      error
    };
  }
};

// Pomoćna funkcija za ekstrahiranje HTML, CSS i JavaScript blokova iz odgovora
function extractCodeBlocks(response) {
  if (!response) return { originalCode: '', language: 'text' };
  
  // Pronađi sve code blokove u sadržaju
  const htmlBlockRegex = /```(?:html|markup)\n([\s\S]*?)\n```/i;
  const cssBlockRegex = /```(?:css)\n([\s\S]*?)\n```/i;
  const jsBlockRegex = /```(?:javascript|js)\n([\s\S]*?)\n```/i;
  const generalBlockRegex = /```([a-z]*)\n([\s\S]*?)\n```/i;
  
  let htmlMatch = response.match(htmlBlockRegex);
  let cssMatch = response.match(cssBlockRegex);
  let jsMatch = response.match(jsBlockRegex);
  let generalMatch = response.match(generalBlockRegex);
  
  let result = {
    htmlCode: htmlMatch ? htmlMatch[1].trim() : '',
    cssCode: cssMatch ? cssMatch[1].trim() : '',
    jsCode: jsMatch ? jsMatch[1].trim() : '',
    originalCode: generalMatch ? generalMatch[2] : '',
    language: generalMatch ? (generalMatch[1] || 'text') : 'text'
  };
  
  // Ako nemamo HTML, ali imamo originalni kod koji izgleda kao HTML
  if (!result.htmlCode && 
      (/<html|<!DOCTYPE html|<body|<head|<div|<span|<p|<a/i.test(result.originalCode) || 
       result.language === 'html' || result.language === 'markup')) {
    result.htmlCode = result.originalCode;
    result.language = 'html';
  }
  
  // Pokušaj pronaći CSS i JS unutar style i script tagova u HTML kodu (ako postoji)
  if (result.htmlCode && !result.cssCode) {
    const styleTagRegex = /<style>([\s\S]*?)<\/style>/i;
    const styleMatch = result.htmlCode.match(styleTagRegex);
    if (styleMatch && styleMatch[1]) {
      result.cssCode = styleMatch[1].trim();
    }
  }
  
  if (result.htmlCode && !result.jsCode) {
    const scriptTagRegex = /<script>([\s\S]*?)<\/script>/i;
    const scriptMatch = result.htmlCode.match(scriptTagRegex);
    if (scriptMatch && scriptMatch[1]) {
      result.jsCode = scriptMatch[1].trim();
    }
  }
  
  return result;
}

// Pomoćna funkcija za pripremu kompletnog HTML koda s ugrađenim CSS-om i JavaScript-om
function prepareFullHtmlCode(html, css, js) {
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
}

// Resetuje trenutnu sesiju
export const resetSession = () => {
  currentSessionId = null;
  console.log("Sesija resetovana");
};

// Vraća trenutni session ID
export const getCurrentSessionId = () => {
  return currentSessionId;
};

export const getSessions = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/sessions`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching sessions:', error);
    throw error;
  }
};

export const getSessionDetails = async (sessionId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/session/${sessionId}`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching session ${sessionId}:`, error);
    throw error;
  }
};

// Funkcija za detekciju jezika koda na osnovu sadržaja
function detectLanguage(code) {
  if (!code) return 'text';
  
  // Detektiraj jezik na osnovu sintakse
  if (/<html|<!DOCTYPE html|<body|<head|<div|<span|<p|<a/i.test(code)) {
    return 'html';
  }
  
  if (/def\s+\w+\s*\(|import\s+\w+|from\s+\w+\s+import|if\s+__name__\s*==\s*('|")__main__\1:|class\s+\w+/i.test(code)) {
    return 'python';
  }
  
  if (/function\s+\w+\s*\(|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=|document\.|window\.|console\.|new Promise/i.test(code)) {
    return 'javascript';
  }
  
  if (/\{\s*[\w-]+\s*:\s*[^;]+;\s*\}|@media|@keyframes|#[\w-]+\s*\{/i.test(code)) {
    return 'css';
  }
  
  // Default
  return 'text';
}