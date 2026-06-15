import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ScribeWidget from './components/ScribeWidget';
import './App.css';

const API_URL = 'http://localhost:8000/api';

export default function App() {
  const [activeApp, setActiveApp] = useState('nmail'); // 'nmail' or 'emacloud'
  const [currentRoute, setCurrentRoute] = useState('/');
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle', 'syncing', 'success', 'error'
  const [indexedFiles, setIndexedFiles] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // Reset states on activeApp change
  useEffect(() => {
    setSyncStatus('idle');
    setCurrentRoute('/');
    setSearchResults([]);
    setSearchQuery('');
  }, [activeApp]);

  // Sync / Reindex handler
  const handleSync = async () => {
    setSyncStatus('syncing');
    try {
      const res = await axios.post(`${API_URL}/reindex`, {
        application: activeApp
      });
      setSyncStatus('success');
      setIndexedFiles(res.data.filesIndexed);
    } catch (err) {
      console.error(err);
      setSyncStatus('error');
    }
  };

  // Live direct search in dashboard
  const handleDashboardSearch = async (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      // Direct catalog search
      const res = await axios.post(`${API_URL}/chat`, {
        application: activeApp,
        sessionId: 'dash_search',
        question: q
      });
      
      setSearchResults([{
        title: q.includes('Watchdog') ? 'Watchdog' : q.includes('domain') ? 'Domain Management' : q.includes('campaign') ? 'Email Campaigns' : 'Reporting',
        answer: res.data.answer,
        url: res.data.url
      }]);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="dashboard-container">
      <header className="dash-header">
        <div className="brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="me-2 text-violet">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
          <h4>Scribe <span className="badge fs-7 bg-violet-dim">Admin Dashboard</span></h4>
        </div>
        <div className="app-selector">
          <button
            className={`selector-btn ${activeApp === 'nmail' ? 'active' : ''}`}
            onClick={() => setActiveApp('nmail')}
          >
            Nmail Product
          </button>
          <button
            className={`selector-btn ${activeApp === 'emacloud' ? 'active' : ''}`}
            onClick={() => setActiveApp('emacloud')}
          >
            EmaCloud Product
          </button>
        </div>
      </header>

      <div className="dash-layout">
        {/* Left column: Admin & Sync Actions */}
        <div className="dash-col col-left">
          <div className="glass-panel">
            <h5 className="panel-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="me-2 text-teal">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
              </svg>
              Documentation Sync Control
            </h5>
            <p className="text-secondary small">
              Simulates webhook or manual sync of documentation repositories ({activeApp === 'nmail' ? 'nmail-docs' : 'emacloud-docs'}).
            </p>
            
            <div className="sync-box">
              <div className="sync-details">
                <span className="text-secondary small">Status:</span>
                <span className={`sync-status ${syncStatus}`}>
                  {syncStatus.toUpperCase()}
                </span>
              </div>
              <button 
                className="btn-sync" 
                onClick={handleSync}
                disabled={syncStatus === 'syncing'}
              >
                {syncStatus === 'syncing' ? 'Syncing...' : 'Force Reindex Now'}
              </button>
            </div>
            
            {syncStatus === 'success' && (
              <div className="alert-success mt-3 small">
                ✓ Index updated. Loaded <strong>{indexedFiles}</strong> documents into catalog.
              </div>
            )}
          </div>

          <div className="glass-panel mt-4">
            <h5 className="panel-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="me-2 text-violet">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              Index Quick Search
            </h5>
            <p className="text-secondary small">Direct search against the in-memory catalog.</p>
            
            <input
              type="text"
              className="dash-search-input"
              placeholder="Search keyword..."
              value={searchQuery}
              onChange={handleDashboardSearch}
            />

            {searchResults.length > 0 && (
              <div className="search-results-list mt-3">
                {searchResults.map((res, i) => (
                  <div key={i} className="search-result-card">
                    <span className="badge bg-teal-dim mb-2">{res.title}</span>
                    <p className="small mb-1">{res.answer}</p>
                    {res.url && (
                      <button 
                        className="btn-link-action"
                        onClick={() => setCurrentRoute(res.url)}
                      >
                        Mock Go to {res.url}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Simulated Browser / Product App Interface */}
        <div className="dash-col col-right">
          <div className="browser-mockup">
            <div className="browser-header">
              <div className="browser-dots">
                <span className="dot red"></span>
                <span className="dot yellow"></span>
                <span className="dot green"></span>
              </div>
              <div className="browser-address-bar">
                <span className="text-secondary">https://{activeApp}.company.com</span>
                <span className="text-violet font-monospace">{currentRoute}</span>
              </div>
            </div>

            <div className="browser-body">
              {currentRoute === '/' ? (
                <div className="browser-content-home">
                  <h3>Welcome to {activeApp === 'nmail' ? 'Nmail Dashboard' : 'EmaCloud Studio'}</h3>
                  <p className="text-secondary">This represents your product application's React container. Try triggering queries inside the floating chatbot widget at the bottom right corner.</p>
                  
                  <div className="feature-grid">
                    {activeApp === 'nmail' ? (
                      <>
                        <div className="feature-card" onClick={() => setCurrentRoute('/watchdog')}>
                          <h5>Watchdog System</h5>
                          <span className="small text-secondary">Monitoring logs & crons</span>
                        </div>
                        <div className="feature-card" onClick={() => setCurrentRoute('/domains')}>
                          <h5>Domain Setup</h5>
                          <span className="small text-secondary">SPF, DKIM, MX keys</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="feature-card" onClick={() => setCurrentRoute('/campaigns')}>
                          <h5>Email Campaigns</h5>
                          <span className="small text-secondary">Templates & dispatch</span>
                        </div>
                        <div className="feature-card" onClick={() => setCurrentRoute('/reporting')}>
                          <h5>Analytics Reports</h5>
                          <span className="small text-secondary">Clicks, opens, bounces</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="browser-content-page">
                  <button className="btn-back" onClick={() => setCurrentRoute('/')}>
                    ← Back to Dashboard
                  </button>
                  <div className="page-body">
                    <span className="badge bg-teal-dim mb-2">Simulated Page</span>
                    <h2>Active Page: {currentRoute}</h2>
                    <p className="mt-3 text-secondary">
                      You navigated to <code>{currentRoute}</code>. In a production scenario, 
                      the parent React application routes the user using <code>navigate('{currentRoute}')</code> callback triggered by clicking the "Open Page" action link in the Scribe widget.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Scribe Widget */}
      <ScribeWidget
        key={activeApp} // force re-mount on product change to recreate sessionId and state
        application={activeApp}
        apiUrl={API_URL}
        onNavigate={(url) => {
          console.log('App received route from ScribeWidget:', url);
          setCurrentRoute(url);
        }}
      />
    </div>
  );
}
