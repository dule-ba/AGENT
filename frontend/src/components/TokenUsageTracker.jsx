import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';

// Cijene po 1000 tokena za različite provajdere i modele
const PRICE_PER_1K_TOKENS = {
  anthropic: {
    'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
    'claude-3-sonnet-20240229': { input: 3.0, output: 15.0 },
    'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
    'default': { input: 3.0, output: 15.0 }, // Default ako model nije specificiran
  },
  openai: {
    'gpt-4': { input: 30.0, output: 60.0 },
    'gpt-4-turbo': { input: 10.0, output: 30.0 },
    'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
    'default': { input: 10.0, output: 30.0 }, // Default ako model nije specificiran
  },
  google: {
    'gemini-pro': { input: 0.125, output: 0.375 },
    'default': { input: 0.125, output: 0.375 }, // Default ako model nije specificiran
  },
  default: { input: 5.0, output: 15.0 } // Fallback ako provider nije poznat
};

// TokenUsageTracker komponenta
const TokenUsageTracker = forwardRef((props, ref) => {
  const [expanded, setExpanded] = useState(false);
  const [usageData, setUsageData] = useState({});
  const [totalCost, setTotalCost] = useState(0);
  const [totalTokens, setTotalTokens] = useState({ input: 0, output: 0 });
  const [selectedProvider, setSelectedProvider] = useState('all');
  
  // Učitaj podatke iz localStorage prilikom učitavanja komponente
  useEffect(() => {
    const savedData = localStorage.getItem('token_usage_data');
    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        setUsageData(parsedData);
        
        // Izračunaj ukupni trošak i tokene
        calculateTotals(parsedData);
      } catch (error) {
        console.error('Error loading token usage data:', error);
      }
    }
  }, []);
  
  // Izračunaj ukupne troškove i tokene
  const calculateTotals = (data) => {
    let cost = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    
    Object.keys(data).forEach(provider => {
      Object.keys(data[provider]).forEach(model => {
        const modelData = data[provider][model];
        const priceData = 
          PRICE_PER_1K_TOKENS[provider]?.[model] || 
          PRICE_PER_1K_TOKENS[provider]?.default || 
          PRICE_PER_1K_TOKENS.default;
        
        // Izračunaj troškove
        const inputCost = (modelData.input / 1000) * priceData.input;
        const outputCost = (modelData.output / 1000) * priceData.output;
        
        cost += inputCost + outputCost;
        inputTokens += modelData.input;
        outputTokens += modelData.output;
      });
    });
    
    setTotalCost(cost);
    setTotalTokens({ input: inputTokens, output: outputTokens });
  };
  
  // Expose updateTokenUsage method to parent components through ref
  useImperativeHandle(ref, () => ({
    updateTokenUsage: (provider, model, inputTokens, outputTokens) => {
      // Default values ako nisu specificirana
      provider = provider || 'unknown';
      model = model || 'default';
      
      // Ažuriraj usage data
      setUsageData(prevData => {
        const newData = { ...prevData };
        
        // Initialize provider if it doesn't exist
        if (!newData[provider]) {
          newData[provider] = {};
        }
        
        // Initialize model if it doesn't exist
        if (!newData[provider][model]) {
          newData[provider][model] = { input: 0, output: 0 };
        }
        
        // Update token counts
        newData[provider][model].input += inputTokens;
        newData[provider][model].output += outputTokens;
        
        // Sačuvaj u localStorage
        localStorage.setItem('token_usage_data', JSON.stringify(newData));
        
        // Recalculate totals
        calculateTotals(newData);
        
        return newData;
      });
    }
  }));
  
  // Reset token usage data
  const handleReset = () => {
    if (window.confirm('Jeste li sigurni da želite resetovati statistiku korištenja tokena?')) {
      setUsageData({});
      setTotalCost(0);
      setTotalTokens({ input: 0, output: 0 });
      localStorage.removeItem('token_usage_data');
    }
  };
  
  // Filtriraj podatke po odabranom provideru
  const filteredData = selectedProvider === 'all' 
    ? usageData 
    : { [selectedProvider]: usageData[selectedProvider] || {} };
  
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-4 text-white">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-bold flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 9a2 2 0 10-4 0v5a2 2 0 01-2 2h6m-6-4h4m8 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Token Tracker
        </h3>
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setExpanded(!expanded)} 
            className="text-gray-400 hover:text-white"
            title={expanded ? "Smanji" : "Proširi"}
          >
            {expanded ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>
        </div>
      </div>
      
      <div className="flex justify-between items-center text-sm mb-2">
        <div className="flex items-center">
          <span className="text-gray-400 mr-1">Ukupno:</span>
          <span className="font-bold text-green-400">${totalCost.toFixed(4)}</span>
        </div>
        <div>
          <span className="text-gray-400 mr-1">Tokeni:</span>
          <span className="font-bold">{totalTokens.input + totalTokens.output}</span>
        </div>
      </div>
      
      {expanded && (
        <div className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <select 
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
            >
              <option value="all">Svi provideri</option>
              {Object.keys(usageData).map(provider => (
                <option key={provider} value={provider}>
                  {provider.charAt(0).toUpperCase() + provider.slice(1)}
                </option>
              ))}
            </select>
            
            <button 
              onClick={handleReset}
              className="bg-red-900 hover:bg-red-800 text-white text-xs px-2 py-1 rounded"
            >
              Reset
            </button>
          </div>
          
          <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
            {Object.keys(filteredData).length === 0 ? (
              <div className="text-gray-400 text-sm text-center py-4">
                Nema podataka o korištenju tokena
              </div>
            ) : (
              Object.keys(filteredData).map(provider => (
                <div key={provider} className="space-y-2">
                  <h4 className="text-sm font-medium text-blue-400">
                    {provider.charAt(0).toUpperCase() + provider.slice(1)}
                  </h4>
                  
                  <div className="pl-2 space-y-2">
                    {Object.keys(filteredData[provider]).map(model => {
                      const modelData = filteredData[provider][model];
                      const priceData = 
                        PRICE_PER_1K_TOKENS[provider]?.[model] || 
                        PRICE_PER_1K_TOKENS[provider]?.default || 
                        PRICE_PER_1K_TOKENS.default;
                      
                      const inputCost = (modelData.input / 1000) * priceData.input;
                      const outputCost = (modelData.output / 1000) * priceData.output;
                      const totalModelCost = inputCost + outputCost;
                      
                      return (
                        <div key={model} className="text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-300">{model}</span>
                            <span className="text-green-400">${totalModelCost.toFixed(4)}</span>
                          </div>
                          <div className="flex justify-between text-gray-400 mt-1">
                            <span>Input: {modelData.input} tokens</span>
                            <span>Output: {modelData.output} tokens</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
          
          <div className="text-xs text-gray-400 p-2 bg-gray-900 bg-opacity-50 rounded mt-4">
            <p className="mb-1">Cijene su bazirane na standardnim cijenama za najveće pružatelje usluga.</p>
            <p>Prikazani troškovi su procjene i mogu se razlikovati od stvarnih troškova.</p>
          </div>
        </div>
      )}
    </div>
  );
});

TokenUsageTracker.displayName = 'TokenUsageTracker';

export default TokenUsageTracker; 