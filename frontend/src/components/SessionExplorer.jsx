import React, { useState, useEffect } from 'react';
import { getSessions, getSessionDetails } from '../api';

const SessionExplorer = ({ onSessionSelect }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [sessionDetails, setSessionDetails] = useState(null);

  // Učitaj listu sesija
  const fetchSessions = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await getSessions();
      setSessions(data.sessions || []);
    } catch (err) {
      setError('Greška prilikom učitavanja sesija: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Učitaj detalje odabrane sesije
  const fetchSessionDetails = async (sessionId) => {
    if (!sessionId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const details = await getSessionDetails(sessionId);
      setSessionDetails(details);
      
      // Proslijedi detalje parent komponenti ako je potrebno
      if (onSessionSelect) {
        onSessionSelect(details);
      }
    } catch (err) {
      setError(`Greška prilikom učitavanja sesije ${sessionId}: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Učitaj sesije pri prvom renderiranju
  useEffect(() => {
    fetchSessions();
  }, []);

  // Rukovanje klikom na sesiju
  const handleSessionClick = (sessionId) => {
    setSelectedSessionId(sessionId);
    fetchSessionDetails(sessionId);
  };

  return (
    <div className="session-explorer glass-card p-5">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gradient">Historija sesija</h2>
        
        <button 
          className="button secondary flex items-center"
          onClick={fetchSessions}
          disabled={loading}
        >
          {loading ? (
            <svg className="animate-spin h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          Osvježi
        </button>
      </div>
      
      {error && (
        <div className="bg-red-900 bg-opacity-20 border border-red-500 text-red-300 p-3 rounded mb-4">
          {error}
        </div>
      )}
      
      <div className="sessions-list mb-6">
        {sessions.length === 0 ? (
          <div className="text-gray-400 p-4 text-center">
            <svg className="w-12 h-12 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p>Nema dostupnih sesija</p>
            <p className="text-xs mt-1">Sesije će se pojaviti nakon razgovora s agentima</p>
          </div>
        ) : (
          <div className="max-h-60 overflow-y-auto">
            <ul className="divide-y divide-gray-700">
              {sessions.map((sessionId) => (
                <li 
                  key={sessionId}
                  className={`py-2 px-3 cursor-pointer hover:bg-gray-800 transition-colors ${
                    sessionId === selectedSessionId ? 'bg-gray-800 border-l-2 border-accent-blue' : ''
                  }`}
                  onClick={() => handleSessionClick(sessionId)}
                >
                  <div className="flex items-center">
                    <svg className="h-4 w-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    <div className="font-medium">Sesija {sessionId.substring(0, 8)}...</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      
      {sessionDetails && (
        <div className="session-details">
          <h3 className="text-lg font-medium mb-3 flex items-center">
            <svg className="h-5 w-5 mr-2 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Detalji sesije
          </h3>
          
          <div className="glass-card bg-opacity-30 p-0 rounded overflow-hidden">
            <div className="max-h-96 overflow-y-auto p-4">
              {sessionDetails.history.map((item, index) => (
                <div key={index} className="mb-5 pb-5 border-b border-gray-700 last:border-0 last:mb-0 last:pb-0">
                  <div className="font-medium text-accent-blue">{item.agent}</div>
                  <div className="text-sm text-gray-300 mt-1">
                    <strong>Upit:</strong> {item.message}
                  </div>
                  <div className="text-sm mt-3">
                    <strong className="text-gray-400">Odgovor:</strong>
                    <pre className="whitespace-pre-wrap mt-1 bg-gray-800 bg-opacity-50 p-3 rounded border border-gray-700 text-xs">
                      {typeof item.response === 'object' 
                        ? JSON.stringify(item.response, null, 2) 
                        : item.response}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionExplorer;