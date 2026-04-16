import { useState, useEffect } from "react";
import "./HeroSlider.css";

import pet1 from "../assets/pet1.jpg";
import pet2 from "../assets/pet2.jpg";
import pet3 from "../assets/pet3.jpg";

const images = [pet1, pet2, pet3];

function HeroSlider({ onOrderClick }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex(prev =>
        prev === images.length - 1 ? 0 : prev + 1
      );
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="hero">
      {images.map((img, index) => (
        <div
          key={index}
          className={`slide ${index === currentIndex ? "active" : ""}`}
          style={{ backgroundImage: `url(${img})` }}
        />
      ))}

      <div className="hero-overlay">
        <div className="hero-content">
          
          {/* Added fontSize here! You can increase or decrease the 4.5rem */}
          <h1 style={{ 
            textShadow: '2px 2px 6px rgba(0, 0, 0, 0.7)', 
            fontSize: '4.5rem',
            marginBottom: '10px' // Added a little space below the title
          }}>
            <span style={{ color: '#ff4d94' }}>HAPPY </span>
            <span style={{ color: '#36d7e8' }}>TAILS </span>
            <span style={{ color: '#ff4d94' }}>CAFÉ</span>
          </h1>
          
          {/* Added fontSize here too! */}
          <p style={{ 
            textShadow: '1px 1px 4px rgba(0, 0, 0, 0.8)', 
            fontWeight: 'bold',
            fontSize: '1.2rem',
            letterSpacing: '2px' // Spaced out the letters slightly to look more premium
          }}>
            CAFE • GROOMING • PET HOTEL • PET SUPPLIES
          </p>

          <button className="hero-btn" onClick={onOrderClick}>
            Order Now
          </button>
        </div>
      </div>
    </div>
  );
}

export default HeroSlider;