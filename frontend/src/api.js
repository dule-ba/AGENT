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

/**
 * Izvrši kompletan workflow - od razumijevanja, generiranja koda, izvršavanja i debugiranja
 * @param {string} message - Poruka za poslati agentu
 * @param {function} onConfirm - Callback koji će biti pozvan kada je potrebna potvrda
 * @param {Object} options - Opcije za izvršavanje
 * @returns {Object} - Rezultat izvršavanja
 */
export const executeWorkflow = async (message, onConfirm, options = {}) => {
  console.log('Pokretanje workflow-a', message);
  
  // Korak 1: Pozovi Executor agenta za razumijevanje intencije
  console.log('Korak 1: Razumijevanje intencije kroz Executor agent');
  const executorResponse = await sendChatMessage(
    message, 
    'executor', 
    { ...options }
  );
  console.log('Executor odgovor:', executorResponse);
  
  let result = {
    inicijalni_odgovor: executorResponse.response,
    sugestirani_agent: executorResponse.suggested_agent,
    kod: [],
    izvrsavanje: null,
    koristeni_agenti: ['Executor']
  };
  
  // Provjeri treba li generisati kod na osnovu odgovora Executor-a
  const potrebanKod = executorResponse.suggested_agent === 'code' || 
                      message.toLowerCase().includes('generiši kod') || 
                      message.toLowerCase().includes('napiši kod') ||
                      message.toLowerCase().includes('kreiraj kod') ||
                      message.toLowerCase().includes('program') ||
                      executorResponse.response.toLowerCase().includes('generiši kod');
  
  if (!potrebanKod) {
    console.log('Nije potreban kod - završavam workflow s odgovorom Executor-a');
    result.status = 'završeno_bez_koda';
    return result;
  }
  
  // Korak 2: Pozovi Code agenta za generiranje koda
  console.log('Korak 2: Generiranje koda kroz Code agent');
  const codeAgentResponse = await sendChatMessage(
    message, 
    'code', 
    { ...options }
  );
  console.log('Code agent odgovor:', codeAgentResponse);
  result.koristeni_agenti.push('Code');
  
  // Ekstraktiraj blokove koda iz odgovora
  const codeBlocks = extractMultipleCodeBlocks(codeAgentResponse.response);
  result.kod = codeBlocks;
  
  if (codeBlocks.length === 0) {
    console.log('Nema pronađenog koda u odgovoru - vraćam rezultat');
    result.inicijalni_odgovor = codeAgentResponse.response;
    result.status = 'bez_koda';
    return result;
  }
  
  // Odluči koji kod će se izvršiti (prvi blok ili korisnikov izbor)
  let izabraniKod;
  let izabraniJezik;
  
  if (codeBlocks.length === 1) {
    // Samo jedan blok koda, koristimo njega
    izabraniKod = codeBlocks[0].code;
    izabraniJezik = codeBlocks[0].language;
  } else if (codeBlocks.length > 1) {
    // Više blokova koda - pitaj korisnika koji želi izvršiti ako postoji funkcija za potvrdu
    if (onConfirm && typeof onConfirm === 'function') {
      const izbor = await onConfirm({
        message: "Pronađeno je više blokova koda. Koji želite izvršiti?",
        options: codeBlocks.map((block, index) => ({
          label: `Blok ${index + 1} (${block.language})`,
          value: index
        }))
      });
      
      if (izbor !== undefined && izbor !== null) {
        izabraniKod = codeBlocks[izbor].code;
        izabraniJezik = codeBlocks[izbor].language;
      } else {
        // Korisnik je odustao
        console.log('Korisnik nije izabrao kod za izvršenje');
        result.status = 'korisnik_odustao';
        return result;
      }
    } else {
      // Nema funkcije za potvrdu, uzmi prvi blok
      izabraniKod = codeBlocks[0].code;
      izabraniJezik = codeBlocks[0].language;
    }
  }
  
  // Korak 3: Izvrši odabrani kod
  if (izabraniKod && izabraniJezik) {
    console.log('Korak 3: Izvršavanje koda', izabraniJezik);
    try {
      const executionResponse = await executeCode(izabraniKod, izabraniJezik);
      console.log('Rezultat izvršavanja:', executionResponse);
      result.izvrsavanje = executionResponse;
      result.status = executionResponse.error ? 'izvršeno_s_greškom' : 'uspješno_izvršeno';
      
      // Korak 4: Debugiranje, ako ima grešaka
      if (executionResponse.error && options.debug !== false) {
        console.log('Korak 4: Debugiranje koda');
        const debugResponse = await sendChatMessage(
          `Moj kod ima grešku: ${executionResponse.error}. Kod: ${izabraniKod}`,
          'debugger',
          { ...options }
        );
        console.log('Debugger odgovor:', debugResponse);
        result.koristeni_agenti.push('Debugger');
        result.debug = debugResponse.response;
      }
    } catch (error) {
      console.error('Greška prilikom izvršavanja koda:', error);
      result.izvrsavanje = { error: error.message };
      result.status = 'greška_izvršavanja';
    }
  }
  
  console.log('Workflow završen, vraćam rezultat:', result);
  return result;
};

/**
 * Ekstraktira više blokova koda iz odgovora.
 * @param {string} response - Odgovor AI agenta
 * @returns {Array} - Niz ekstraktiranih blokova koda
 */
function extractMultipleCodeBlocks(response) {
  if (!response) return [];
  
  const codeBlocks = [];
  // Regularni izraz za pronalazak blokova koda
  const codeBlockRegex = /```([a-zA-Z0-9]*)\n([\s\S]*?)```/g;
  let match;
  
  // Pronađi sve blokove koda
  while ((match = codeBlockRegex.exec(response)) !== null) {
    const language = match[1] || 'text';
    const code = match[2] || '';
    
    if (code.trim()) {
      codeBlocks.push({
        language,
        code,
        fullMatch: match[0]
      });
    }
  }
  
  return codeBlocks;
}

/**
 * Ekstraktira blokove koda iz odgovora.
 * @param {string} response - Odgovor AI agenta
 * @returns {Object} - Ekstraktirani kod i jezik
 */
function extractCodeFromResponse(response) {
  if (!response) return null;
  
  // Regex za pronalaženje code blokova ```language\ncode```
  const codeBlockRegex = /```(?:[a-z]*)\n([\s\S]*?)\n```/i;
  const match = response.match(codeBlockRegex);
  
  if (match && match[1]) {
    return match[1].trim();
  }
  
  return null;
}

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
          // Dodaj body ako ne postoji?
          htmlWithResources = htmlWithResources.replace('</body>', `\n<script>\n${js}\n</script>\n</body>`);
        }
      }
    }

    return htmlWithResources;
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
  localStorage.removeItem('current_session_id');
  console.log("Sesija resetovana");
};

// Vraća trenutni session ID
export const getCurrentSessionId = () => {
  return currentSessionId;
};

// Dohvaćanje liste sesija
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

// Dohvaćanje detalja određene sesije
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

/**
 * Šalje zahtjev na backend API
 */
function sendRequest(endpoint, data = {}) {
  return fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(data)
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }
    return response.json();
  });
}

/**
 * Dohvaća session ID
 */
function getSessionId() {
  return currentSessionId;
}

// Definiraj default model ako nije eksplicitno postavljen
const DEFAULT_MODEL = 'gpt-3.5-turbo';

/**
 * Nastavlja izvršavanje workflow-a nakon korisničke potvrde
 */
export const continueWorkflowExecution = async (previousState, options = {}) => {
  console.log('continueWorkflowExecution dobio podatke:', previousState);
  
  if (!previousState || !previousState.originalPrompt) {
    console.error('Nedostaje originalPrompt u prethodnom stanju:', previousState);
    return { 
      error: true, 
      message: 'Nedostaju potrebni podaci za nastavak workflow-a'
    };
  }

  try {
    // Koristimo sendChatMessage sa Code agentom za generiranje koda
    console.log('Generiranje koda za:', previousState.originalPrompt);
    const codeAgentResponse = await sendChatMessage(
      previousState.originalPrompt,
      'code',
      { 
        model: options.model || DEFAULT_MODEL,
        temperature: options.temperature || 0.7,
        mcpServer: options.mcpServer || 'anthropic'
      }
    );
    
    if (!codeAgentResponse || !codeAgentResponse.response) {
      return {
        error: true,
        message: 'Greška kod generiranja koda',
        phase: 'code_generation'
      };
    }
    
    // Ekstraktiraj kod iz odgovora
    const codeData = extractCodeBlocks(codeAgentResponse.response);
    console.log('Ekstraktirani kod:', codeData);
    
    // Izvrši kod
    let executionResult = null;
    if (codeData.code) {
      executionResult = await executeCode(
        codeData.code, 
        codeData.language || 'javascript',
        'script',
        currentSessionId
      );
    }
    
    // Vrati rezultat workflow-a
    return {
      workflowResult: {
        initialResponse: codeAgentResponse.response,
        code: codeData.code,
        language: codeData.language,
        executionResult: executionResult,
        summary: `Workflow izvršen. ${executionResult ? (executionResult.error ? 'Greška pri izvršavanju.' : 'Kod uspješno izvršen.') : 'Kod nije izvršen.'}`
      },
      phase: executionResult && executionResult.error ? 'execution_error' : 'execution_success',
      message: 'Workflow izvršen'
    };
    
  } catch (error) {
    console.error('Greška kod izvršavanja workflow-a:', error);
    return {
      error: true,
      message: error.message || 'Greška kod izvršavanja workflow-a',
      phase: 'error'
    };
  }
};

/**
 * Učitava sve dostupne sesije iz lokalnog skladišta
 * @returns {Array} Lista svih sesija
 */
export const getAllSessions = () => {
  try {
    const sessions = localStorage.getItem('sessions');
    return sessions ? JSON.parse(sessions) : [];
  } catch (error) {
    console.error('Greška pri učitavanju sesija:', error);
    return [];
  }
};

/**
 * Sprema novu sesiju u lokalno skladište
 * @param {Object} session - Podaci o sesiji
 * @param {string} session.id - ID sesije
 * @param {string} session.timestamp - Vrijeme kreiranja sesije
 * @param {string} session.lastMessage - Posljednja poruka u sesiji
 */
export const saveSession = (session) => {
  try {
    const sessions = getAllSessions();
    const existingIndex = sessions.findIndex(s => s.id === session.id);
    
    if (existingIndex >= 0) {
      // Ažuriraj postojeću sesiju
      sessions[existingIndex] = { ...sessions[existingIndex], ...session };
    } else {
      // Dodaj novu sesiju
      sessions.push(session);
    }
    
    localStorage.setItem('sessions', JSON.stringify(sessions));
    return true;
  } catch (error) {
    console.error('Greška pri spremanju sesije:', error);
    return false;
  }
};

/**
 * Briše sesiju iz lokalnog skladišta
 * @param {string} sessionId - ID sesije za brisanje
 * @returns {boolean} True ako je brisanje uspješno
 */
export const deleteSessionLocal = (sessionId) => {
  try {
    const sessions = getAllSessions();
    const filteredSessions = sessions.filter(s => s.id !== sessionId);
    localStorage.setItem('sessions', JSON.stringify(filteredSessions));
    return true;
  } catch (error) {
    console.error('Greška pri brisanju sesije:', error);
    return false;
  }
};

/**
 * Učitava sadržaj sesije iz lokalnog skladišta
 * @param {string} sessionId - ID sesije
 * @returns {Object|null} Sadržaj sesije ili null ako sesija nije pronađena
 */
export const getSessionContent = (sessionId) => {
  try {
    const sessionKey = `session_${sessionId}`;
    const content = localStorage.getItem(sessionKey);
    return content ? JSON.parse(content) : null;
  } catch (error) {
    console.error('Greška pri učitavanju sadržaja sesije:', error);
    return null;
  }
};

/**
 * Sprema sadržaj sesije u lokalno skladište
 * @param {string} sessionId - ID sesije
 * @param {Array} messages - Poruke u sesiji
 * @returns {boolean} True ako je spremanje uspješno
 */
export const saveSessionContent = (sessionId, messages) => {
  try {
    const sessionKey = `session_${sessionId}`;
    localStorage.setItem(sessionKey, JSON.stringify(messages));
    
    // Također ažuriraj metapodatke sesije
    const lastMessage = messages.length > 0 ? messages[messages.length - 1].content : '';
    saveSession({
      id: sessionId,
      timestamp: new Date().toISOString(),
      lastMessage: lastMessage.substring(0, 100) + (lastMessage.length > 100 ? '...' : '')
    });
    
    return true;
  } catch (error) {
    console.error('Greška pri spremanju sadržaja sesije:', error);
    return false;
  }
};

/**
 * Učitaj listu sesija
 * @returns {Promise<Array>} Niz sesija
 */
export const listSessions = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/sessions`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP greška ${response.status}`);
    }
    
    return response.json();
  } catch (error) {
    console.error('Greška prilikom učitavanja sesija:', error);
    throw error;
  }
};

/**
 * Učitaj sesiju po ID-u
 * @param {string} sessionId - ID sesije
 * @returns {Promise<Object>} Podaci o sesiji
 */
export const getSession = async (sessionId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP greška ${response.status}`);
    }
    
    return response.json();
  } catch (error) {
    console.error('Greška prilikom učitavanja sesije:', error);
    throw error;
  }
};

/**
 * Obriši sesiju po ID-u
 * @param {string} sessionId - ID sesije
 * @returns {Promise<Object>} Rezultat operacije
 */
export const deleteSession = async (sessionId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP greška ${response.status}`);
    }
    
    return response.json();
  } catch (error) {
    console.error('Greška prilikom brisanja sesije:', error);
    throw error;
  }
};

/**
 * Dohvati dostupne modele ovisno o odabranom MCP serveru
 * @param {string} mcpServer - Naziv MCP servera ('anthropic' ili 'openai')
 * @returns {Promise<Object>} - Rezultat API poziva s dostupnim modelima
 */
export const getAvailableModels = async (mcpServer = 'anthropic') => {
  try {
    let endpoint;
    if (mcpServer.toLowerCase() === 'openai') {
      endpoint = '/api/openai/models';
    } else {
      endpoint = '/api/anthropic/models';
    }
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching available models for ${mcpServer}:`, error);
    throw error;
  }
};

/**
 * Dohvati statistiku korištenja tokena za trenutnu sesiju (samo za OpenAI)
 * @param {string} sessionId - ID sesije (opcionalno, koristi trenutnu ako nije navedeno)
 * @returns {Promise<Object>} - Statistika korištenja tokena
 */
export const getTokenUsageStats = async (sessionId = null) => {
  try {
    const activeSessionId = sessionId || currentSessionId;
    if (!activeSessionId) {
      throw new Error('Nema aktivne sesije za dohvat statistike tokena');
    }
    
    const response = await fetch(`${API_BASE_URL}/api/openai/token-usage/${activeSessionId}`, {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching token usage stats:', error);
    throw error;
  }
};