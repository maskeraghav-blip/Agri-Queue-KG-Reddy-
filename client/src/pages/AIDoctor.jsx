import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';

const compressImage = (file, maxWidth = 1024, quality = 0.82) => {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl);
    };
    img.onerror = () => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
  });
};

export default function AIDoctor() {
  const { t } = useTranslation();
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    // Cleanup URL when component unmounts or file changes
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null);
    }
  };

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;
    setAnalyzing(true);
    setResult(null);
    
    try {
      const compressedB64 = await compressImage(selectedFile);
      const res = await api.post('/doctor/analyze', {
        base64Image: compressedB64,
        mimeType: 'image/jpeg'
      }, { timeout: 120000 });
      setResult(res.data);
    } catch (err) {
      console.error('API Error:', err);
      setResult({
        disease: 'Analysis Error',
        confidence: 'N/A',
        recommendation: err.response?.data?.error || 'AI Doctor analysis took longer than expected. Please retry with a clear crop photo.',
        crop: 'Unknown'
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setResult(null);
  };

  return (
    <div className="page">
      <style>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
      <div className="container" style={{ maxWidth: 600 }}>
        <h1 className="page-title animate-in">🩺 {t('ai_doctor.title')}</h1>
        
        <div className="badge badge-warning" style={{ display: 'block', padding: 12, marginBottom: 20 }}>
          {t('ai_doctor.disclaimer')}
        </div>

        <div className="card animate-slide-up">
          <div className="card-body">
            {!previewUrl ? (
              <form onSubmit={(e) => e.preventDefault()}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <div style={{ position: 'relative', border: '2px dashed var(--color-border)', padding: '48px 24px', textAlign: 'center', borderRadius: 'var(--radius-lg)', background: 'var(--color-bg)', cursor: 'pointer', overflow: 'hidden', transition: 'all 0.3s' }} className="upload-zone">
                    <input type="file" accept="image/*" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 10 }} onChange={handleFileChange} />
                    <span style={{ fontSize: 48, display: 'block', marginBottom: 16 }}>📷</span>
                    <h3 style={{ margin: '0 0 8px', color: 'var(--color-text)', fontSize: 20 }}>Upload Crop Photo</h3>
                    <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 14 }}>Tap to take a photo or select an image to scan for diseases</p>
                  </div>
                </div>
              </form>
            ) : (
              <div>
                <div style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: '#000', marginBottom: 20, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={previewUrl} alt="Crop preview" style={{ width: '100%', maxHeight: 400, objectFit: 'contain', display: 'block', opacity: analyzing ? 0.7 : 1, transition: 'opacity 0.3s' }} />
                  
                  {/* Scanning Animation overlay */}
                  {analyzing && (
                    <>
                      {/* Laser Line */}
                      <div style={{
                        position: 'absolute',
                        left: 0,
                        width: '100%',
                        height: '3px',
                        background: '#00ff00',
                        boxShadow: '0 0 20px 5px rgba(0, 255, 0, 0.8)',
                        animation: 'scan 2s infinite linear'
                      }}></div>

                      {/* AR Targeting Bracket (Top Left) */}
                      <div style={{ position: 'absolute', top: '10%', left: '10%', width: '40px', height: '40px', borderTop: '4px solid #00ff00', borderLeft: '4px solid #00ff00', opacity: 0.8 }}></div>
                      {/* AR Targeting Bracket (Top Right) */}
                      <div style={{ position: 'absolute', top: '10%', right: '10%', width: '40px', height: '40px', borderTop: '4px solid #00ff00', borderRight: '4px solid #00ff00', opacity: 0.8 }}></div>
                      {/* AR Targeting Bracket (Bottom Left) */}
                      <div style={{ position: 'absolute', bottom: '10%', left: '10%', width: '40px', height: '40px', borderBottom: '4px solid #00ff00', borderLeft: '4px solid #00ff00', opacity: 0.8 }}></div>
                      {/* AR Targeting Bracket (Bottom Right) */}
                      <div style={{ position: 'absolute', bottom: '10%', right: '10%', width: '40px', height: '40px', borderBottom: '4px solid #00ff00', borderRight: '4px solid #00ff00', opacity: 0.8 }}></div>

                      {/* Pulsing Grid Overlay */}
                      <div style={{ 
                        position: 'absolute', 
                        inset: 0, 
                        background: 'linear-gradient(rgba(0, 255, 0, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 0, 0.1) 1px, transparent 1px)',
                        backgroundSize: '20px 20px',
                        animation: 'pulse 1.5s infinite alternate' 
                      }}></div>

                      {/* Scanning Text */}
                      <div style={{
                        position: 'absolute',
                        bottom: '20px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        color: '#00ff00',
                        fontFamily: 'monospace',
                        fontSize: '18px',
                        fontWeight: 'bold',
                        letterSpacing: '2px',
                        textShadow: '0 0 10px #00ff00'
                      }}>
                        ANALYZING...
                      </div>
                    </>
                  )}
                  
                  {!analyzing && !result && (
                    <button onClick={resetForm} style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, zIndex: 20 }}>
                      ✕
                    </button>
                  )}
                </div>

                {!result ? (
                  <button onClick={handleAnalyze} className="btn btn-primary btn-block" disabled={analyzing} style={{ fontSize: 16, padding: '12px' }}>
                    {analyzing ? '🔍 Scanning for diseases...' : '🔍 Scan Image'}
                  </button>
                ) : (
                  <button onClick={resetForm} className="btn btn-secondary btn-block">
                    📷 Scan Another Image
                  </button>
                )}
              </div>
            )}

            {result && (
              <div className="animate-in" style={{ marginTop: 24 }}>
                <h3 style={{ color: 'var(--color-primary-dark)', marginBottom: 16 }}>📋 Analysis Result</h3>
                
                {/* Not a plant warning */}
                {result.is_plant === false && (
                  <div style={{ background: '#fff8e1', padding: 16, borderRadius: 'var(--radius-sm)', borderLeft: '4px solid #f59e0b', marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 'bold', color: '#b45309', marginBottom: 8 }}>⚠️ Not an Agricultural Image</div>
                    <div style={{ lineHeight: 1.5, fontSize: 15, color: '#92400e' }}>{result.recommendation}</div>
                  </div>
                )}

                {/* AI unavailable error */}
                {result.is_plant === null && (
                  <div style={{ background: '#f3f4f6', padding: 16, borderRadius: 'var(--radius-sm)', borderLeft: '4px solid #6b7280', marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 'bold', color: '#374151', marginBottom: 8 }}>🔌 {result.disease}</div>
                    <div style={{ lineHeight: 1.5, fontSize: 15, color: '#4b5563' }}>{result.recommendation}</div>
                  </div>
                )}

                {/* Actual plant diagnosis result */}
                {(result.is_plant === true || result.is_plant === undefined) && result.disease !== 'Analysis Error' && (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div style={{ background: 'var(--color-bg)', padding: 12, borderRadius: 'var(--radius-sm)', borderLeft: `4px solid ${result.disease?.toLowerCase().includes('healthy') ? '#10b981' : 'var(--color-error)'}` }}>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Detected Disease</div>
                      <div style={{ fontWeight: 'bold', fontSize: 16, color: result.disease?.toLowerCase().includes('healthy') ? '#10b981' : 'var(--color-error)' }}>{result.disease}</div>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div style={{ background: 'var(--color-bg)', padding: 12, borderRadius: 'var(--radius-sm)', borderLeft: '4px solid var(--color-primary)' }}>
                        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Confidence Score</div>
                        <div style={{ fontWeight: 'bold', fontSize: 16 }}>{result.confidence}</div>
                      </div>
                      <div style={{ background: 'var(--color-bg)', padding: 12, borderRadius: 'var(--radius-sm)', borderLeft: '4px solid #f59e0b' }}>
                        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Crop</div>
                        <div style={{ fontWeight: 'bold', fontSize: 16 }}>{result.crop}</div>
                      </div>
                    </div>

                    <div style={{ background: 'var(--color-accent-bg)', padding: 16, borderRadius: 'var(--radius-sm)', borderLeft: '4px solid var(--color-accent)' }}>
                      <div style={{ fontSize: 12, color: 'var(--color-accent-dark)', marginBottom: 8, fontWeight: 600 }}>Recommended Treatment</div>
                      <div style={{ lineHeight: 1.5, fontSize: 15 }}>{result.recommendation}</div>
                    </div>
                  </div>
                )}

                {/* Legacy error handling */}
                {result.disease === 'Analysis Error' && (
                  <div style={{ background: '#fef2f2', padding: 16, borderRadius: 'var(--radius-sm)', borderLeft: '4px solid var(--color-error)' }}>
                    <div style={{ fontSize: 14, fontWeight: 'bold', color: 'var(--color-error)', marginBottom: 8 }}>❌ {result.disease}</div>
                    <div style={{ lineHeight: 1.5, fontSize: 15 }}>{result.recommendation}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
