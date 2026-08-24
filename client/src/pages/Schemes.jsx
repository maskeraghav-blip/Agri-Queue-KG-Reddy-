import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';
import schemesData from '../data/schemesData';
import { useAuth } from '../context/AuthContext';
import './Schemes.css';

export default function Schemes() {
  const { t, i18n } = useTranslation();
  const { farmer } = useAuth();

  // State
  const [schemes, setSchemes] = useState(schemesData);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // AI Advisor Drawer State
  const [isAdvisorOpen, setIsAdvisorOpen] = useState(false);
  const [focusedScheme, setFocusedScheme] = useState(null);
  const [chatMessages, setChatMessages] = useState([
    {
      id: 'welcome',
      sender: 'assistant',
      text: i18n.language === 'hi'
        ? 'नमस्ते किसान भाई! मैं किसान योजना मित्र हूँ। आप सरकारी योजनाओं, सब्सिडी, किसान क्रेडिट कार्ड या फसल बीमा के बारे में कुछ भी पूछ सकते हैं।'
        : i18n.language === 'te'
        ? 'నమస్కారం రైతు సోదరా! నేను కిసాన్ యోజన మిత్రను. మీరు ప్రభుత్వ పథకాలు, రాయితీలు, కేసీసీ లేదా పంట బీమా గురించి ఏదైనా అడగవచ్చు.'
        : 'Namaste Kisan! I am Kisan Yojana Mitra. Ask me anything about central & state subsidies, PM-KISAN, crop insurance, or KCC low-interest loans.'
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speakingId, setSpeakingId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  // Fetch live updates from API while keeping fallback dataset ready
  useEffect(() => {
    let isMounted = true;
    api.get('/schemes')
      .then(res => {
        if (isMounted && Array.isArray(res.data) && res.data.length > 0) {
          // Merge API data with fallback attributes like category & icon if missing
          const merged = res.data.map(apiItem => {
            const fallbackItem = schemesData.find(f => f.id === apiItem.id || f.title.toLowerCase().includes(apiItem.title?.toLowerCase()));
            return {
              ...fallbackItem,
              ...apiItem,
              icon: fallbackItem?.icon || apiItem.icon || '🌾',
              category: fallbackItem?.category || apiItem.category || 'cash',
              benefit_badge: fallbackItem?.benefit_badge || apiItem.benefit_badge || 'Govt Benefit',
              benefit_badge_hi: fallbackItem?.benefit_badge_hi || apiItem.benefit_badge_hi,
              benefit_badge_te: fallbackItem?.benefit_badge_te || apiItem.benefit_badge_te,
              required_documents: Array.isArray(apiItem.required_documents) ? apiItem.required_documents : fallbackItem?.required_documents || []
            };
          });
          setSchemes(merged);
        }
      })
      .catch(err => {
        console.info('Using embedded fallback schemes:', err.message);
      });

    return () => { isMounted = false; };
  }, []);

  // Scroll chat to bottom
  useEffect(() => {
    if (isAdvisorOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isAdvisorOpen]);

  // Multilingual field selector
  const getLocalized = (item, field) => {
    if (!item) return '';
    if (i18n.language === 'hi' && item[`${field}_hi`]) return item[`${field}_hi`];
    if (i18n.language === 'te' && item[`${field}_te`]) return item[`${field}_te`];
    return item[field] || '';
  };

  // Filter schemes
  const filteredSchemes = schemes.filter(s => {
    const matchesCategory = selectedCategory === 'all' || s.category === selectedCategory;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return matchesCategory;

    const titleEn = (s.title || '').toLowerCase();
    const titleHi = (s.title_hi || '').toLowerCase();
    const titleTe = (s.title_te || '').toLowerCase();
    const descEn = (s.description || '').toLowerCase();
    const descHi = (s.description_hi || '').toLowerCase();
    const descTe = (s.description_te || '').toLowerCase();
    const benefit = (s.benefit_badge || '').toLowerCase();

    const matchesSearch = titleEn.includes(query) || 
                          titleHi.includes(query) || 
                          titleTe.includes(query) || 
                          descEn.includes(query) || 
                          descHi.includes(query) || 
                          descTe.includes(query) || 
                          benefit.includes(query);

    return matchesCategory && matchesSearch;
  });

  // Open advisor with specific scheme context
  const handleOpenAdvisor = (scheme = null) => {
    if (scheme) {
      setFocusedScheme(scheme);
      const schemeTitle = getLocalized(scheme, 'title');
      const introMsg = {
        id: Date.now().toString(),
        sender: 'assistant',
        text: i18n.language === 'hi'
          ? `मैंने **${schemeTitle}** को चुना है। आप इसकी पात्रता, लाभ या आवेदन प्रक्रिया के बारे में क्या जानना चाहते हैं?`
          : i18n.language === 'te'
          ? `నేను **${schemeTitle}**ను ఎంచుకున్నాను. మీరు దీని అర్హత, ప్రయోజనాలు లేదా దరఖాస్తు విధానం గురించి ఏమి తెలుసుకోవాలనుకుంటున్నారు?`
          : `Focused on **${schemeTitle}**. Would you like to know about required documents, eligibility criteria, or how to apply?`
      };
      setChatMessages(prev => [...prev, introMsg]);
    }
    setIsAdvisorOpen(true);
  };

  // Send message to AI Advisor
  const handleSendMessage = async (customText = null) => {
    const textToSend = customText || inputMessage;
    if (!textToSend || !textToSend.trim() || isAiLoading) return;

    const userMsg = {
      id: Date.now().toString(),
      sender: 'user',
      text: textToSend.trim()
    };

    setChatMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsAiLoading(true);

    try {
      const response = await api.post('/schemes/chat', {
        message: textToSend.trim(),
        history: chatMessages.slice(-6).map(m => ({ sender: m.sender, text: m.text })),
        schemeContext: focusedScheme,
        userProfile: farmer ? {
          state: farmer.state,
          land_size: farmer.land_size,
          crops: farmer.crop_types
        } : null,
        language: i18n.language || 'en'
      });

      const aiReply = response.data.reply || 'I am ready to help you with any government scheme questions.';
      setChatMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: aiReply
      }]);
    } catch (err) {
      console.error('Advisor chat error:', err);
      // Fallback local response
      const fallbackText = focusedScheme 
        ? `${getLocalized(focusedScheme, 'title')}: ${getLocalized(focusedScheme, 'description')}\nBenefit: ${getLocalized(focusedScheme, 'benefit_badge')}\nPortal: ${focusedScheme.link}`
        : 'You can apply for agricultural schemes through your nearest CSC or state agriculture portal.';
      setChatMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: fallbackText
      }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Web Speech Recognition (Speech to Text)
  const toggleSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert(t('schemes.speech_not_supported') || 'Speech recognition is not supported in this browser.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = i18n.language === 'hi' ? 'hi-IN' : (i18n.language === 'te' ? 'te-IN' : 'en-IN');
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputMessage(transcript);
          handleSendMessage(transcript);
        }
      };

      recognition.onerror = (e) => {
        console.warn('Speech recognition error:', e.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
    }
  };

  // Text to Speech (Voice Output)
  const handleSpeak = (messageId, text) => {
    if (!('speechSynthesis' in window)) return;

    if (speakingId === messageId) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel();
    // Strip markdown formatting for cleaner speech
    const cleanText = text.replace(/[*#_`[\]]/g, '').trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);

    if (i18n.language === 'hi') utterance.lang = 'hi-IN';
    else if (i18n.language === 'te') utterance.lang = 'te-IN';
    else utterance.lang = 'en-IN';

    utterance.rate = 0.95;
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);

    setSpeakingId(messageId);
    window.speechSynthesis.speak(utterance);
  };

  // Copy text to clipboard
  const handleCopy = (messageId, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(messageId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Quick suggestions
  const suggestions = [
    i18n.language === 'hi' ? 'PM-KISAN ₹6,000 कैसे पाएं?' : i18n.language === 'te' ? 'పీఎం కిసాన్ ₹6,000 ఎలా పొందాలి?' : 'How to get PM-KISAN ₹6,000?',
    i18n.language === 'hi' ? 'फसल बीमा का क्लेम कैसे करें?' : i18n.language === 'te' ? 'పంట బీమా క్లెయిమ్ ఎలా చేయాలి?' : 'How to claim PMFBY crop insurance?',
    i18n.language === 'hi' ? 'KCC 4% ब्याज पर ऋण कैसे लें?' : i18n.language === 'te' ? '4% వడ్డీకి KCC లోన్ ఎలా పొందాలి?' : 'How to apply for KCC 4% loan?',
    i18n.language === 'hi' ? 'सोलर पंप पर 60% सब्सिडी कैसे मिलेगी?' : i18n.language === 'te' ? 'సోలార్ పంపుపై 60% సబ్సిడీ ఎలా వస్తుంది?' : 'Solar Pump 60% subsidy steps?'
  ];

  return (
    <div className="page schemes-page">
      <div className="container">

        {/* 1. Header & Top Bar */}
        <div className="schemes-header-wrapper animate-in">
          <div className="schemes-header">
            <div className="schemes-title-area">
              <h1>🌾 {t('schemes.title')}</h1>
              <p>{t('schemes.subtitle')}</p>
            </div>
            <button 
              className="btn-advisor-trigger"
              onClick={() => handleOpenAdvisor(null)}
              id="schemes-ask-advisor-btn"
            >
              <span className="advisor-icon">💬</span>
              <span>{t('schemes.ask_advisor')}</span>
            </button>
          </div>
        </div>

        {/* 2. Controls: Search Input & Category Filter Pills */}
        <div className="schemes-controls animate-in" style={{ animationDelay: '0.05s' }}>
          <div className="schemes-search-box">
            <span className="schemes-search-icon">🔍</span>
            <input
              type="text"
              className="schemes-search-input"
              placeholder={t('schemes.search_placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              id="schemes-search-input"
            />
            {searchQuery && (
              <button className="schemes-search-clear" onClick={() => setSearchQuery('')}>✕</button>
            )}
          </div>

          <div className="schemes-filter-pills">
            <button
              className={`filter-pill ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              <span>{t('schemes.filter_all')}</span>
              <span className="filter-count">{schemes.length}</span>
            </button>
            <button
              className={`filter-pill ${selectedCategory === 'cash' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('cash')}
            >
              <span>{t('schemes.filter_cash')}</span>
            </button>
            <button
              className={`filter-pill ${selectedCategory === 'insurance' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('insurance')}
            >
              <span>{t('schemes.filter_insurance')}</span>
            </button>
            <button
              className={`filter-pill ${selectedCategory === 'loans' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('loans')}
            >
              <span>{t('schemes.filter_loans')}</span>
            </button>
            <button
              className={`filter-pill ${selectedCategory === 'equipment' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('equipment')}
            >
              <span>{t('schemes.filter_equipment')}</span>
            </button>
          </div>
        </div>

        {/* 3. Schemes Card Grid */}
        {filteredSchemes.length > 0 ? (
          <div className="schemes-grid">
            {filteredSchemes.map((scheme, idx) => (
              <div 
                key={scheme.id} 
                className="scheme-card animate-in"
                style={{ animationDelay: `${0.05 + idx * 0.04}s` }}
              >
                {/* Header */}
                <div className="scheme-card-header">
                  <div className="scheme-icon-circle">
                    {scheme.icon || '🌾'}
                  </div>
                  <div className="scheme-title-group">
                    <h3 className="scheme-card-title">
                      {getLocalized(scheme, 'title')}
                    </h3>
                    <div className="scheme-benefit-badge">
                      ✨ {getLocalized(scheme, 'benefit_badge')}
                    </div>
                  </div>
                </div>

                {/* Body */}
                <div className="scheme-card-body">
                  <p className="scheme-description">
                    {getLocalized(scheme, 'description')}
                  </p>

                  <div className="scheme-eligibility-box">
                    <div className="scheme-eligibility-label">
                      {t('schemes.eligibility')}
                    </div>
                    <p className="scheme-eligibility-text">
                      {getLocalized(scheme, 'eligibility')}
                    </p>
                  </div>

                  {scheme.required_documents && scheme.required_documents.length > 0 && (
                    <div className="scheme-documents-list">
                      {scheme.required_documents.slice(0, 3).map((doc, dIdx) => (
                        <span key={dIdx} className="scheme-doc-badge">
                          📄 {doc}
                        </span>
                      ))}
                      {scheme.required_documents.length > 3 && (
                        <span className="scheme-doc-badge">
                          +{scheme.required_documents.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="scheme-card-actions">
                  <button 
                    className="btn-card-ask"
                    onClick={() => handleOpenAdvisor(scheme)}
                  >
                    <span>💬</span>
                    <span>{t('schemes.ask_ai')}</span>
                  </button>
                  <a
                    href={scheme.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-card-apply"
                  >
                    <span>{t('schemes.apply')}</span>
                    <span>↗</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="schemes-empty animate-in">
            <h3>🔍 {t('schemes.no_schemes_found')}</h3>
            <p>Try clearing your search query or selecting "All Schemes".</p>
            <button 
              className="btn btn-secondary"
              onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
            >
              {t('schemes.clear_filter')}
            </button>
          </div>
        )}

      </div>

      {/* 4. Slide-Over AI Scheme Advisor Chatbot Drawer */}
      {isAdvisorOpen && (
        <>
          <div 
            className="advisor-backdrop"
            onClick={() => setIsAdvisorOpen(false)}
          />
          <div className="advisor-drawer" id="kisan-advisor-drawer">
            {/* Header */}
            <div className="advisor-drawer-header">
              <div className="advisor-title-info">
                <div className="advisor-avatar">🌾</div>
                <div className="advisor-header-text">
                  <h3>{t('schemes.chat_title')}</h3>
                  <p>{t('schemes.chat_subtitle')}</p>
                </div>
              </div>
              <button 
                className="advisor-close-btn"
                onClick={() => setIsAdvisorOpen(false)}
                aria-label="Close advisor"
              >
                ✕
              </button>
            </div>

            {/* Focused Scheme Banner */}
            {focusedScheme && (
              <div className="advisor-focused-banner">
                <div className="focused-tag">
                  <span>🎯</span>
                  <span>{t('schemes.chat_focused_on')}: <strong>{getLocalized(focusedScheme, 'title')}</strong></span>
                </div>
                <button 
                  className="btn-clear-focused"
                  onClick={() => setFocusedScheme(null)}
                  title={t('schemes.clear_context')}
                >
                  ✕
                </button>
              </div>
            )}

            {/* Suggestions Chips */}
            <div className="advisor-suggestions">
              {suggestions.map((sug, sIdx) => (
                <button
                  key={sIdx}
                  className="suggestion-chip"
                  onClick={() => handleSendMessage(sug)}
                >
                  {sug}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="advisor-messages">
              {chatMessages.map(msg => (
                <div 
                  key={msg.id} 
                  className={`chat-bubble-wrapper ${msg.sender}`}
                >
                  <div className="chat-bubble">
                    {msg.text.split('\n').map((line, lIdx) => (
                      <p key={lIdx}>{line}</p>
                    ))}
                  </div>
                  {msg.sender === 'assistant' && (
                    <div className="chat-bubble-actions">
                      <button 
                        className={`bubble-action-btn ${speakingId === msg.id ? 'active' : ''}`}
                        onClick={() => handleSpeak(msg.id, msg.text)}
                        title={t('schemes.listen_voice')}
                      >
                        <span>{speakingId === msg.id ? '⏹️' : '🔊'}</span>
                        <span>{speakingId === msg.id ? 'Stop' : t('schemes.listen_voice')}</span>
                      </button>
                      <button 
                        className="bubble-action-btn"
                        onClick={() => handleCopy(msg.id, msg.text)}
                        title={t('schemes.copy')}
                      >
                        <span>{copiedId === msg.id ? '✓' : '📋'}</span>
                        <span>{copiedId === msg.id ? t('schemes.copied') : t('schemes.copy')}</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {isAiLoading && (
                <div className="chat-bubble-wrapper assistant">
                  <div className="typing-indicator">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input Bar */}
            <div className="advisor-input-bar">
              {isListening && (
                <div className="listening-hint">
                  <span>🎙️</span>
                  <span>{t('schemes.listening')}</span>
                </div>
              )}
              <div className="input-row">
                <input
                  type="text"
                  className="advisor-input"
                  placeholder={t('schemes.chat_placeholder')}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendMessage();
                  }}
                  id="advisor-message-input"
                />
                <button
                  className={`btn-mic ${isListening ? 'listening' : ''}`}
                  onClick={toggleSpeechRecognition}
                  title="Speak your question"
                  type="button"
                >
                  🎙️
                </button>
                <button
                  className="btn-send"
                  onClick={() => handleSendMessage()}
                  disabled={!inputMessage.trim() || isAiLoading}
                  aria-label="Send message"
                  type="button"
                >
                  ➤
                </button>
              </div>
            </div>

          </div>
        </>
      )}

    </div>
  );
}
