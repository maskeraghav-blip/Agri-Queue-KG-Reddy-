import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigate } from 'react-router-dom';

export default function Transport() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const assets = [
    {
      id: 1,
      name: 'Small Pickup Truck',
      distance: '5 km away',
      price: 500,
      unit: '/trip',
      rating: '4.8',
      image: 'https://images.unsplash.com/photo-1559297434-fae8a1916a79?w=600&auto=format&fit=crop&q=80',
      fallbackImage: '/images/truck1.jpg',
      tags: ['1 Ton Capacity', 'Fast']
    },
    {
      id: 2,
      name: 'Medium Cargo Truck',
      distance: '12 km away',
      price: 1200,
      unit: '/trip',
      rating: '4.9',
      image: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=600&auto=format&fit=crop&q=80',
      fallbackImage: '/images/truck2.jpg',
      tags: ['5 Ton Capacity', 'Covered']
    },
    {
      id: 3,
      name: 'Farm Tractor with Trailer',
      distance: '3 km away',
      price: 800,
      unit: '/trip',
      rating: '4.5',
      image: 'https://images.unsplash.com/photo-1592878904946-b3cd8ae243d0?w=600&auto=format&fit=crop&q=80',
      fallbackImage: '/images/truck3.jpg',
      tags: ['Local Transport', 'High Torque']
    },
    {
      id: 4,
      name: 'Heavy Cold Storage Truck',
      distance: '20 km away',
      price: 2500,
      unit: '/trip',
      rating: '4.2',
      image: 'https://images.unsplash.com/photo-1519003722824-194d4455a60c?w=600&auto=format&fit=crop&q=80',
      fallbackImage: '/images/truck4.jpg',
      tags: ['Cold Storage', 'Long Distance']
    }
  ];

  const handleBook = (name) => {
    alert(`Successfully added ${name} to cart!`);
  };

  return (
    <div className="page" style={{ paddingTop: 32 }}>
      <div className="container">
        
        {/* Header Section */}
        <div className="card" style={{ padding: '24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, background: 'var(--color-surface)' }}>
          <div>
            <h1 style={{ margin: '0 0 8px', fontSize: '1.5rem', color: '#111827' }}>Asset Sharing Economy</h1>
            <p style={{ margin: 0, color: '#4B5563', fontSize: '0.95rem' }}>Rent high-tech machinery on demand. Earn by listing your idle assets.</p>
          </div>
          <button className="btn btn-primary" style={{ padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>+</span> List My Equipment
          </button>
        </div>

        {/* Assets Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
          {assets.map((asset, i) => (
            <div key={asset.id} className="card animate-slide-up" style={{ 
              animationDelay: `${i * 0.1}s`, 
              background: 'var(--color-surface)', 
              borderRadius: '12px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
            }}>
              {/* Image */}
              <div style={{ position: 'relative', height: 200, backgroundColor: '#F8F9FA' }}>
                <img 
                  src={asset.image} 
                  alt={asset.name} 
                  loading="lazy" 
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = asset.fallbackImage || '/images/truck1.jpg';
                  }}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
                
                {/* Rating */}
                <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,0.9)', color: '#D97706', padding: '4px 8px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                  ★ {asset.rating}
                </div>
              </div>
              
              {/* Content */}
              <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#111827', flex: 1 }}>{asset.name}</h3>
                  <div style={{ color: 'var(--color-primary)', fontSize: '1.2rem', fontWeight: 700, marginLeft: 8 }}>₹{asset.price}<span style={{ fontSize: '0.8rem', color: '#6B7280', fontWeight: 500 }}>{asset.unit}</span></div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#6B7280', fontSize: '0.85rem', marginBottom: 16 }}>
                  <span>📍</span> {asset.distance}
                </div>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                  {asset.tags.map((tag, idx) => (
                    <span key={idx} style={{ background: '#F3F4F6', border: '1px solid #E5E7EB', color: '#4B5563', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 500 }}>
                      {tag}
                    </span>
                  ))}
                </div>

                <button 
                  onClick={() => navigate('/book-transport', { state: { vehicleName: asset.name } })}
                  style={{ width: '100%', background: '#2D6A4F', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                  Register
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
