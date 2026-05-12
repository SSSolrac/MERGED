import { useEffect, useState } from "react";
import "./HeroSlider.css";

import pet1 from "../assets/pet1.jpg";
import pet2 from "../assets/pet2.jpg";
import pet3 from "../assets/pet3.jpg";

const images = [pet1, pet2, pet3];

function HeroSlider({ onOrderClick }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="hero">
      {images.map((img, index) => (
        <div
          key={img}
          className={`slide ${index === currentIndex ? "active" : ""}`}
          style={{ backgroundImage: `url(${img})` }}
        />
      ))}

      <div className="hero-overlay">
        <div className="hero-content">
          <h1>
            <span className="hero-word hero-word--pink">HAPPY</span>
            <span className="hero-word hero-word--blue">TAILS</span>
            <span className="hero-word hero-word--pink">CAF{"\u00c9"}</span>
          </h1>

          <p>CAFE {"\u2022"} GROOMING {"\u2022"} PET HOTEL {"\u2022"} PET SUPPLIES</p>

          <button className="hero-btn" onClick={onOrderClick}>
            Order Now
          </button>
        </div>
      </div>
    </div>
  );
}

export default HeroSlider;
