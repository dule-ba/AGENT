import React, { useState, useEffect } from 'react';
import { FaTrash, FaExternalLinkAlt, FaSearch, FaClock } from 'react-icons/fa';
import { getAllSessions, deleteSession } from '../api';
import './SessionExplorer.css';

/**
 * Komponenta za prikaz i upravljanje historijom sesija
 * 
 * @param {Object} props - Props komponente
 * @param {Array} props.sessions - Lista sesija (opciono, ako nije proslijeđeno, poziva getAllSessions)
 * @param {Function} props.onSelectSession - Funkcija koja se poziva pri odabiru sesije
 * @param {Function} props.onDeleteSession - Funkcija koja se poziva pri brisanju sesije
 * @returns {JSX.Element} SessionExplorer komponenta
 */
const SessionExplorer = ({ sessions: propSessions, onSelectSession, onDeleteSession }) => {
  const [sessions, setSessions] = useState(propSessions || []);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredSessions, setFilteredSessions] = useState([]);

  // Učitaj sesije ako nisu proslijeđene kroz props
  useEffect(() => {
    if (!propSessions) {
      setSessions(getAllSessions());
    } else {
      setSessions(propSessions);
    }
  }, [propSessions]);

  // Filtriraj sesije pri promjeni search izraza
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredSessions(sessions);
    } else {
      const term = searchTerm.toLowerCase();
      setFilteredSessions(
        sessions.filter(
          session => 
            session.id.toLowerCase().includes(term) || 
            (session.name && session.name.toLowerCase().includes(term)) ||
            (session.lastMessage && session.lastMessage.toLowerCase().includes(term))
        )
      );
    }
  }, [searchTerm, sessions]);

  // Formatiraj timestamp u čitljivi datum
  const formatDate = (timestamp) => {
    if (!timestamp) return 'Nepoznato vrijeme';
    
    try {
      const date = new Date(timestamp);
      return date.toLocaleString();
    } catch (e) {
      return 'Neispravan format datuma';
    }
  };

  // Skrati session ID za prikaz
  const shortenSessionId = (id) => {
    if (!id) return 'ID nije dostupan';
    return id.length > 8 ? `${id.substring(0, 8)}...` : id;
  };

  // Hendlaj brisanje sesije
  const handleDeleteSession = (sessionId, e) => {
    e.stopPropagation();
    if (window.confirm('Da li ste sigurni da želite obrisati ovu sesiju?')) {
      const success = deleteSession(sessionId);
      if (success) {
        setSessions(prevSessions => prevSessions.filter(s => s.id !== sessionId));
        if (onDeleteSession) onDeleteSession(sessionId);
      }
    }
  };

  // Hendlaj odabir sesije
  const handleSelectSession = (sessionId) => {
    if (onSelectSession) onSelectSession(sessionId);
  };

  return (
    <div className="session-explorer">
      <div className="session-explorer-header">
        <h2>Historija sesija</h2>
        <div className="search-container">
          <FaSearch className="search-icon" />
          <input
            type="text"
            placeholder="Pretraži sesije..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      <div className="sessions-list">
        {filteredSessions.length === 0 ? (
          <div className="no-sessions">
            {searchTerm.trim() 
              ? 'Nema rezultata za vašu pretragu.' 
              : 'Nema dostupnih sesija.'}
          </div>
        ) : (
          filteredSessions.map(session => (
            <div 
              key={session.id} 
              className="session-item"
              onClick={() => handleSelectSession(session.id)}
            >
              <div className="session-info">
                <div className="session-name">
                  {session.name || `Sesija ${shortenSessionId(session.id)}`}
                </div>
                <div className="session-id">ID: {shortenSessionId(session.id)}</div>
                {session.timestamp && (
                  <div className="session-time">
                    <FaClock className="time-icon" /> {formatDate(session.timestamp)}
                  </div>
                )}
                {session.lastMessage && (
                  <div className="session-message">{session.lastMessage}</div>
                )}
              </div>
              
              <div className="session-actions">
                <button 
                  className="session-select-btn"
                  onClick={() => handleSelectSession(session.id)}
                  title="Učitaj sesiju"
                >
                  <FaExternalLinkAlt />
                </button>
                <button 
                  className="session-delete-btn"
                  onClick={(e) => handleDeleteSession(session.id, e)}
                  title="Obriši sesiju"
                >
                  <FaTrash />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SessionExplorer;