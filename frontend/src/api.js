// API klijent za komunikaciju s backend servisom

const API_BASE_URL = 'http://localhost:8080';

// Lokalna varijabla za praćenje session_id-a
let currentSessionId = localStorage.getItem('current_session_id') || null;

// Postavi sesiju pri pokretanju
console.log(`Inicijalna sesija: ${currentSessionId || 'nova sesija'}`);
console.log(`API_BASE_URL = ${API_BASE_URL}`);

// Glavni API poziv za komunikaciju s agentima
export const sendChatMessage = async (message, agent = 'executor', options = {}) => {
  const { model = 'default', temperature = 0.7, mcpServer = 'anthropic', auto_process = true } = options;
  
  try {
    console.log(`Šaljem poruku sa ID sesije: ${currentSessionId || 'nova sesija'}`);
    console.log(`Šaljem na URL: ${API_BASE_URL}/chat`);
    console.log(`Payload: `, JSON.stringify({
        message,
        agent,
        auto_process,
        model,
        temperature,
        mcp_server: mcpServer,
        session_id: currentSessionId
    }));
    
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
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
      console.error(`API error: ${response.statusText}, Status: ${response.status}`);
      throw new Error(`API error: ${response.statusText}, Status: ${response.status}`);
    }

    const result = await response.json();
    console.log('API odgovor primljen:', result);
    
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
    console.error('Error details:', error.message, error.stack);
    console.error('Network status:', navigator.onLine ? 'Konekcija dostupna' : 'Nema konekcije');
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
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
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
    mcpServer = 'anthropic',
    workflowType = 'code',
    confirmationMode = true,
    continueExecution = false,
    previousResponse = null
  } = options;

  // Ako nastavljamo izvršavanje nakon potvrde korisnika
  if (continueExecution && previousResponse) {
    return continueWorkflowExecution(previousResponse, options);
  }

  let initialAgentResponse;
  let plannerResponse;
  const originalPrompt = message;

  try {
    // Korak 1: Poziv Executor agentu da razumije namjeru
    console.log(`Workflow - Korak 1: Pozivam Executor agenta da razumije upit: "${message}"`);
    try {
      initialAgentResponse = await sendChatMessage(
        message,
        'executor',
        { model, temperature, mcpServer, auto_process: false }
      );

      if (!initialAgentResponse || !initialAgentResponse.response) {
        throw new Error('Nema odgovora od Executor agenta');
      }
    } catch (fetchError) {
      console.error('Greška u komunikaciji s backendom:', fetchError);
      return {
        status: 'error',
        message: 'Greška tijekom izvršavanja workflow-a: ' + (fetchError.message || 'Failed to fetch'),
        phase: 'intent_analysis_failed',
        workflowResult: {
          error: fetchError.message || 'Neuspješna komunikacija s backendom. Provjerite da li backend server radi.',
          agents: ['Executor'],
          initialResponse: "Greška u komunikaciji s backendom. Provjerite da li backend radi."
        },
        originalPrompt
      };
    }

    // Korak 1.5: Dobijanje plana izvršavanja od planner agenta
    console.log(`Workflow - Korak 1.5: Pozivam Planner agenta za plan izvršavanja...`);
    try {
      const plannerMessage = `Na osnovu korisničkog zahtjeva: "${message}", napravi detaljan plan izvršavanja. 
Koje korake treba poduzeti da se ispuni ovaj zahtjev? 
Koji agenti trebaju biti uključeni? 
Objasni korisniku kako ćeš riješiti njegov zadatak.`;
      
      plannerResponse = await sendChatMessage(
        plannerMessage,
        'planner',
        { model, temperature, mcpServer, auto_process: false }
      );

    } catch (plannerError) {
      console.log('Greška pri dobijanju plana, nastavljam bez plana:', plannerError);
      plannerResponse = {
        response: "Nije bilo moguće generisati plan izvršavanja. Nastavit ću s izvršavanjem na osnovu dostupnih informacija."
      };
    }

    // Dodamo plan u rezultat koji vraćamo 
    const executorAnalysis = initialAgentResponse.response;
    const plan = plannerResponse?.response || "Plan nije dostupan.";
    
    // Provjera da li treba generisati kod (slična logika kao prije)
    const executorResponseText = initialAgentResponse.response.toLowerCase();
    const suggestedAgent = initialAgentResponse.suggested_agent;
    const requiresCode = suggestedAgent === 'code' ||
                   executorResponseText.includes('programiranje') ||
                   executorResponseText.includes('kod') ||
                   executorResponseText.includes('napravi') ||
                   executorResponseText.includes('kreiraj') ||
                   executorResponseText.includes('```');

    // Ako je uključen confirmation mode, vrati samo rezultat prve faze i traži potvrdu
    if (confirmationMode) {
      console.log('Workflow - Vraćam plan i čekam potvrdu korisnika prije nastavka.');
      return {
        status: 'awaiting_confirmation',
        message: 'Čekam potvrdu korisnika za nastavak izvršavanja.',
        phase: 'planning',
        workflowResult: {
          executorAnalysis: executorAnalysis,
          initialResponse: plan,
          suggestedAgent: suggestedAgent,
          requiresCode: requiresCode,
          agents: ['Executor', 'Planner']
        },
        originalPrompt
      };
    }

    // Ako nije uključen confirmation mode, automatski nastavi s izvršavanjem
    const continueOptions = { 
      ...options, 
      continueExecution: true,
      confirmationMode: false
    };

    // Nastavi s izvršavanjem
    return continueWorkflowExecution({
      executorAnalysis,
      initialResponse: plan,
      suggestedAgent: suggestedAgent,
      requiresCode,
      originalPrompt
    }, continueOptions);

  } catch (error) {
    console.error('Greška tokom izvršavanja workflow-a:', error);
    return {
      status: 'error',
      message: `Greška tijekom izvršavanja workflow-a: ${error.message}`,
      phase: 'error',
      workflowResult: {
        error: error.message,
        initialResponse: "Došlo je do greške u izvršavanju workflow-a."
      }
    };
  }
};

// Nastavak izvršavanja workflow-a nakon potvrde
const continueWorkflowExecution = async (previousState, options = {}) => {
  const {
    model = 'default',
    temperature = 0.7,
    mcpServer = 'anthropic',
    workflowType = 'code'
  } = options;

  const { 
    executorAnalysis, 
    initialResponse, 
    suggestedAgent, 
    requiresCode, 
    originalPrompt 
  } = previousState;

  let codeAgentResponse;
  let generatedCode = null;
  let generatedLanguage = 'text';
  let codeBlocks = {};

  try {
    // Korak 2: Ako je potreban kod, pozovi Code agenta
    if (requiresCode) {
      console.log(`Workflow - Korak 2: Pozivam Code agenta...`);
      const codeAgentMessage = `Na osnovu zahtjeva korisnika: "${originalPrompt}", molim te generiši odgovarajući kod.`;

      try {
        codeAgentResponse = await sendChatMessage(
          codeAgentMessage,
          'code',
          { model, temperature, mcpServer, auto_process: false }
        );

        if (!codeAgentResponse || !codeAgentResponse.response) {
          console.warn('Code agent nije vratio odgovor, pokušavam koristiti odgovor Executora.');
          codeBlocks = extractCodeBlocks(executorAnalysis);
        } else {
          codeBlocks = extractCodeBlocks(codeAgentResponse.response);
        }
      } catch (codeError) {
        console.error('Greška kod poziva Code agenta:', codeError);
        return {
          status: 'error',
          message: 'Greška kod generisanja koda: ' + (codeError.message || 'Failed to fetch'),
          phase: 'code_generation_failed',
          workflowResult: {
            initialResponse: initialResponse,
            response: executorAnalysis,
            error: codeError.message || 'Neuspješna komunikacija s Code agentom',
            agents: ['Executor', 'Planner']
          },
          originalPrompt
        };
      }

      generatedCode = codeBlocks.code;
      generatedLanguage = codeBlocks.language;

      if (!generatedCode) {
          console.log('Workflow - Korak 2 Result: Ni Code agent nije vratio kod. Završavam workflow.');
          return {
              status: 'completed_no_code',
              message: 'Čini se da zahtjev nije rezultirao kodom.',
              phase: 'code_generation_failed',
              workflowResult: {
                  initialResponse: initialResponse,
                  summary: executorAnalysis,
                  agents: ['Executor', 'Planner']
              },
              originalPrompt
          };
      }
      console.log(`Workflow - Korak 2 Result: Kod (${generatedLanguage}) generisan.`);
    } else {
        console.log('Workflow - Završavam jer nije potreban kod.');
        return {
            status: 'completed_no_code',
            message: 'Zahtjev ne zahtijeva generisanje koda.',
            phase: 'intent_analysis',
            workflowResult: {
                initialResponse: initialResponse,
                summary: executorAnalysis,
                agents: ['Executor', 'Planner']
            },
            originalPrompt
        };
    }

    // Korak 3: Izvršavanje koda (koristi generisani kod)
    console.log(`Workflow - Korak 3: Izvršavanje koda (${generatedLanguage})...`);
    const executionResult = await executeCode(
      generatedCode,
      generatedLanguage,
      'script',
      currentSessionId,
      {
        autoDebug: workflowType !== 'no_debug',
        mcpServer
      }
    );

    // Korak 4: Ako je bilo grešaka i izvršen je debug, pokušaj ponovo izvršiti kod
    let fixedResult = null;
    let fixedCode = null;
    if (executionResult.error && executionResult.debugResult) {
      console.log('Workflow - Korak 4: Pokušavam izvršiti ispravljeni kod nakon debugiranja...');

      const fixedBlocks = extractCodeBlocks(executionResult.debugResult);
      fixedCode = fixedBlocks.code;
      const fixedLanguage = fixedBlocks.language || generatedLanguage;

      if (fixedCode) {
        console.log('Izvršavanje ispravljenog koda...');
        fixedResult = await executeCode(
          fixedCode,
          fixedLanguage,
          'script',
          currentSessionId,
          { autoDebug: false, mcpServer }
        );
        console.log('Workflow - Korak 4 Result: Izvršavanje ispravljenog koda završeno.');
      } else {
        console.log('Workflow - Korak 4 Result: Nije pronađen ispravljeni kod u debug odgovoru.');
      }
    }

    // Korak 5: Vrati finalni rezultat workflowa
    console.log('Workflow - Korak 5: Sastavljanje finalnog rezultata.');
    return {
      status: 'completed',
      message: fixedResult ? 'Workflow završen s debugiranjem' : 'Workflow završen',
      phase: fixedResult ? 'execution_fixed' : 'execution',
      workflowResult: {
          initialResponse: initialResponse,
          executorAnalysis: executorAnalysis,
          codeAgentResponse: codeAgentResponse ? codeAgentResponse.response : null,
          code: {
              original: generatedCode,
              fixed: fixedCode,
              language: generatedLanguage,
              css: codeBlocks.cssCode,
              js: codeBlocks.jsCode
          },
          executionResult: executionResult,
          fixedResult: fixedResult,
          agents: ['Executor', 'Planner', ...(requiresCode ? ['Code'] : []), 'Executor(Code)', ...(executionResult.wasDebugAttempted ? ['Debugger'] : []), ...(fixedResult ? ['Executor(FixedCode)'] : [])],
          type: 'code'
      },
      originalPrompt,
      mcpServer
    };
  } catch (error) {
    console.error('Greška tokom nastavka izvršavanja workflow-a:', error);
    return {
      status: 'error',
      message: `Greška tijekom izvršavanja workflow-a: ${error.message}`,
      phase: 'error',
      workflowResult: {
        error: error.message,
        initialResponse: initialResponse || "Došlo je do greške u izvršavanju workflow-a."
      }
    };
  }
};

// Pomoćna funkcija za ekstrakciju koda - **VAŽNO**: Prebaciti u poseban util fajl?
function extractCodeBlocks(content) {
    if (!content) return { code: null, language: 'text', htmlCode: null, cssCode: null, jsCode: null };

    let htmlCode = null;
    let cssCode = null;
    let jsCode = null;
    let originalCode = null; // Za ne-HTML kod
    let language = 'text';

    // Prioritet za HTML blokove
    const htmlBlockRegex = /```(?:html|markup)\n([\s\S]*?)\n```/gi;
    htmlBlockRegex.lastIndex = 0;
    let match = htmlBlockRegex.exec(content);
    if (match && match[1]) {
        htmlCode = match[1].trim();
        language = 'markup';
    }

    // CSS blokovi
    const cssBlockRegex = /```(?:css)\n([\s\S]*?)\n```/gi;
    cssBlockRegex.lastIndex = 0;
    match = cssBlockRegex.exec(content);
    if (match && match[1]) {
        cssCode = match[1].trim();
        if (!htmlCode) language = 'css'; // Ako nema HTML-a, CSS može biti primarni
    }

    // JS blokovi
    const jsBlockRegex = /```(?:javascript|js)\n([\s\S]*?)\n```/gi;
    jsBlockRegex.lastIndex = 0;
    match = jsBlockRegex.exec(content);
    if (match && match[1]) {
        jsCode = match[1].trim();
        if (!htmlCode && !cssCode) language = 'javascript'; // Ako nema HTML/CSS, JS može biti primarni
    }

    // Ako nema specifičnih blokova, traži generički kod blok
    if (!htmlCode && !cssCode && !jsCode) {
        const genericBlockRegex = /```([a-z]*)\n([\s\S]*?)\n```/i;
        genericBlockRegex.lastIndex = 0;
        match = genericBlockRegex.exec(content);
        if (match && match[2]) {
            originalCode = match[2].trim();
            language = match[1].trim() || 'text';
            if (language === 'js') language = 'javascript';
            if (language === 'py') language = 'python';
        }
    }

    // Ako i dalje nema koda, a sadržaj liči na HTML van blokova
    if (!htmlCode && !originalCode && /<\/?[a-z][\s\S]*>/i.test(content)) {
       const containsBlock = /```[a-z]*\n/i.test(content);
       if (!containsBlock) { // Samo ako nema drugih blokova
           htmlCode = content;
           language = 'markup';
           // Pokušaj izvući inline CSS/JS
           const styleTagRegex = /<style>([\s\S]*?)<\/style>/gi;
           styleTagRegex.lastIndex = 0;
           match = styleTagRegex.exec(htmlCode);
           if (match && match[1]) cssCode = match[1].trim();

           const scriptTagRegex = /<script>([\s\S]*?)<\/script>/gi;
           scriptTagRegex.lastIndex = 0;
           match = scriptTagRegex.exec(htmlCode);
           if (match && match[1]) jsCode = match[1].trim();
       }
    }

    // Ako NEMA koda ni u kom obliku
    if (!htmlCode && !originalCode && !cssCode && !jsCode) {
      originalCode = content; // Vrati originalni tekst ako nema koda
      language = 'text';
    }


    return {
        code: htmlCode || originalCode, // Primarni kod za izvršavanje
        language: language,
        htmlCode: htmlCode,
        cssCode: cssCode,
        jsCode: jsCode,
        originalCode: originalCode // Vraća samo ako nije HTML
    };
}

// Pomoćna funkcija za spajanje HTML, CSS, JS - **VAŽNO**: Prebaciti u util?
function prepareFullHtmlCode(html, css, js) {
   if (!html) return ''; // Vrati prazno ako nema HTML-a

    const isCompleteHtml = /<html|<!DOCTYPE html/i.test(html);

    if (isCompleteHtml) {
      let htmlWithResources = html;
      if (css && !htmlWithResources.includes(`<style>${css}</style>`)) {
        if (htmlWithResources.includes('</head>')) {
          htmlWithResources = htmlWithResources.replace('</head>', `\n<style>\n${css}\n</style>\n</head>`);
        } else {
          // Dodaj head ako ne postoji?
          htmlWithResources = htmlWithResources.replace('<body', '<head>\n<style>\n${css}\n</style>\n</head>\n<body');
        }
      }
      if (js && !htmlWithResources.includes(`<script>${js}</script>`)) {
        if (htmlWithResources.includes('</body>')) {
          htmlWithResources = htmlWithResources.replace('</body>', `\n<script>\n${js}\n</script>\n</body>`);
        } else {
          htmlWithResources += `\n<script>\n${js}\n</script>`;
        }
      }
      return htmlWithResources;
    } else {
      // Kreiraj osnovnu strukturu ako je samo fragment
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Generated Preview</title>
  ${css ? `<style>\n${css}\n</style>` : ''}
</head>
<body>
  ${html}
  ${js ? `\n<script>\n${js}\n</script>` : ''}
</body>
</html>`;
    }
}

// Pomoćna funkcija za detekciju jezika - **VAŽNO**: Prebaciti u util?
function detectLanguage(code) {
    if (!code) return 'text';
    if (/^(def|class|import|from|if|for|while)\s+.+:/m.test(code)) return 'python';
    if (/^(const|let|var|function|class|import)\s+.+/m.test(code)) return 'javascript';
    if (/<\/?[a-z][\s\S]*>/i.test(code)) return 'markup';
    if (/\s*\{\s*[\s\S]*?\s*\}/m.test(code)) return 'css';
    if (/SELECT|FROM|WHERE|INSERT|UPDATE|DELETE/i.test(code)) return 'sql';
    if (/^[$#>].*$/m.test(code)) return 'bash';
    return 'text';
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