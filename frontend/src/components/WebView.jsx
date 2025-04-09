import React, { useState, useEffect, useRef } from 'react';

const WebView = ({ url = 'about:blank', htmlContent = null }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const iframeRef = useRef(null);
  
  // Generiranje iframe src dokumenta ako je htmlContent definiran
  useEffect(() => {
    if (htmlContent) {
      // Resetiraj URL ako imamo HTML sadržaj
      setLoading(true);
      setError(null);
      try {
        if (iframeRef.current) {
          const iframe = iframeRef.current;
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          
          // Upišemo HTML u iframe
          iframeDoc.open();
          iframeDoc.write(htmlContent);
          iframeDoc.close();
          
          setLoading(false);
        }
      } catch (err) {
        setError(`Greška pri prikazivanju HTML-a: ${err.message}`);
        setLoading(false);
      }
    }
  }, [htmlContent]);
  
  // Rukovanje učitavanjem iframe URL-a
  const handleIframeLoad = () => {
    setLoading(false);
  };
  
  const handleIframeError = () => {
    setError(`Greška pri učitavanju URL-a: ${url}`);
    setLoading(false);
  };
  
  return (
    <div className="web-view-container">
      <div className="web-view-header">
        <div className="browser-controls">
          <span className="control-circle red"></span>
          <span className="control-circle yellow"></span>
          <span className="control-circle green"></span>
        </div>
        <div className="address-bar">
          {htmlContent ? 'local-code-preview' : url}
        </div>
      </div>
      
      <div className="web-view-content">
        {loading && !error && (
          <div className="loading-indicator">
            <div className="spinner"></div>
            <p>Učitavanje...</p>
          </div>
        )}
        
        {error && (
          <div className="error-message">
            <p>{error}</p>
            <p>Pokušajte ponovno ili provjerite URL.</p>
          </div>
        )}
        
        <iframe 
          ref={iframeRef}
          src={htmlContent ? 'about:blank' : url}
          className={`web-iframe ${loading || error ? 'hidden' : ''}`}
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          sandbox="allow-scripts allow-forms allow-same-origin"
          title="Web pregled"
        />
      </div>
      
      <style jsx>{`
        .web-view-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          background-color: #1e1e2e;
          color: #f8f8f2;
          border-radius: 8px;
          overflow: hidden;
        }
        
        .web-view-header {
          display: flex;
          align-items: center;
          padding: 8px 12px;
          background-color: #181825;
          border-bottom: 1px solid #313244;
        }
        
        .browser-controls {
          display: flex;
          gap: 6px;
          margin-right: 15px;
        }
        
        .control-circle {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }
        
        .red { background-color: #f38ba8; }
        .yellow { background-color: #f9e2af; }
        .green { background-color: #a6e3a1; }
        
        .address-bar {
          flex: 1;
          background-color: #11111b;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 14px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: #bac2de;
          text-align: center;
        }
        
        .web-view-content {
          flex: 1;
          position: relative;
          background-color: #fff;
        }
        
        .loading-indicator {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background-color: #11111b;
          z-index: 10;
        }
        
        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid rgba(137, 180, 250, 0.3);
          border-radius: 50%;
          border-top-color: #89b4fa;
          animation: spin 1s linear infinite;
          margin-bottom: 15px;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .error-message {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background-color: #11111b;
          z-index: 10;
          padding: 20px;
          text-align: center;
        }
        
        .error-message p:first-child {
          color: #f38ba8;
          font-weight: bold;
          margin-bottom: 10px;
        }
        
        .web-iframe {
          width: 100%;
          height: 100%;
          border: none;
        }
        
        .hidden {
          visibility: hidden;
        }
      `}</style>
    </div>
  );
};

export default WebView; 