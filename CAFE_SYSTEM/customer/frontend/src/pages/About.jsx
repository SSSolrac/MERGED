import { Link } from "react-router-dom";
import aboutUs from "../assets/about/about-us.jpg";
import aboutUsStorefront from "../assets/about/about-us-storefront.jpg";
import aboutUsPetBirthday from "../assets/about/about-us-pet-birthday.jpg";
import aboutUsPetBirthdayTwo from "../assets/about/about-us-pet-birthday-2.jpg";
import "./About.css";

const services = [
  "Cafe",
  "Pet Grooming",
  "Pet Accessories and Supplies",
  "Pet Hotel",
  "Dog and Cat Cakes",
  "Pet Birthday Parties",
];

function About() {
  return (
    <div className="about-page">
      <section className="about-intro">
        <div className="about-intro__inner">
          <p className="about-eyebrow">Happy Tails Pet Cafe</p>
          <h1>This Is Us</h1>
          <p className="about-intro__lead">
            Happy Tails Pet Cafe is a cozy, pet-friendly space in Lucena City where good food, warm coffee, and genuine
            love for animals come together. We created it as a place where fur parents can relax, connect, celebrate,
            and enjoy meaningful time with their pets in an atmosphere that feels welcoming from the moment you walk in.
          </p>
        </div>
      </section>

      <section className="about-split about-split--image-left">
        <div className="about-split__media">
          <img src={aboutUs} alt="Inside Happy Tails Pet Cafe with soft pink and teal seating" />
        </div>

        <div className="about-split__content">
          <p className="about-kicker">Our Concept</p>
          <h2>A pet cafe that feels like home</h2>
          <p>
            At Happy Tails, pets are family. That idea shapes everything from our bright and welcoming interiors to the
            way we serve customers who want more than just a quick cafe stop. Whether you are here to unwind after a
            long day, meet fellow pet lovers, or spend a slow afternoon with your furry companion, we want the space to
            feel comforting, cheerful, and easy to enjoy.
          </p>
          <p>
            We pair handcrafted drinks and cafe favorites with a pet-friendly environment so both people and animals can
            feel welcome. The goal is simple: create a place where everyday visits become happy memories.
          </p>
          <div className="about-actions">
            <Link to="/order" className="about-button about-button--primary">
              Start Ordering
            </Link>
            <Link to="/menu" className="about-button">
              View Cafe Menu
            </Link>
          </div>
        </div>
      </section>

      <section className="about-split about-split--image-right">
        <div className="about-split__content">
          <p className="about-kicker">What We Offer</p>
          <h2>More than a usual cafe visit</h2>
          <p>
            Happy Tails is built around the everyday needs of fur parents. Aside from serving food and drinks, we also
            offer pet care services that make the space feel practical, reliable, and community-centered for animal
            lovers in Lucena.
          </p>

          <div className="about-service-grid">
            {services.map((service) => (
              <span key={service} className="about-service-pill">
                {service}
              </span>
            ))}
          </div>

          <p>
            From cafe bonding time to pet supplies, grooming support, hotel stays, and even special celebration setups,
            we want Happy Tails to be a place people think of not only for coffee, but for moments that matter with
            their pets.
          </p>
        </div>

        <div className="about-split__media">
          <img src={aboutUsStorefront} alt="Happy Tails Pet Cafe storefront in Lucena City" />
        </div>
      </section>

      <section className="about-band">
        <div className="about-band__inner">
          <p>For the love of pets, comfort, and everyday moments shared together.</p>
        </div>
      </section>

      <section className="about-split about-split--image-left">
        <div className="about-split__media about-split__media--stack">
          <img src={aboutUsPetBirthday} alt="Birthday setup inside Happy Tails Pet Cafe" />
          <img src={aboutUsPetBirthdayTwo} alt="Birthday food spread at Happy Tails Pet Cafe" />
        </div>

        <div className="about-split__content">
          <p className="about-kicker">Celebrate Here</p>
          <h2>Made for pawties and special days</h2>
          <p>
            Happy Tails is also a place for celebrations. With dog and cat cakes, birthday pawty setups, and a playful
            atmosphere, the cafe is designed for milestones that pet owners want to make extra memorable. The bright
            colors, pet-themed details, and friendly setup give every gathering a warm, joyful energy.
          </p>
          <p>
            Whether it is a simple treat day or a full pet birthday celebration, we want guests to feel like Happy
            Tails is a space where special moments can be shared comfortably with the whole family, paws included.
          </p>
        </div>
      </section>

      <section className="about-visit">
        <div className="about-visit__card">
          <p className="about-kicker">Visit Happy Tails</p>
          <h2>See you in Happy Tails</h2>
          <div className="about-visit__grid">
            <div>
              <h3>Location</h3>
              <p>AMCJ Commercial Building, Bonifacio Drive, Pleasantville, Lucena City</p>
            </div>
            <div>
              <h3>Open Daily</h3>
              <p>Monday-Friday: 8:00 AM - 7:30 PM</p>
              <p>Saturday-Sunday: 8:00 AM - 8:00 PM</p>
            </div>
          </div>
          <p className="about-visit__note">
            Drop by for cafe favorites, pet essentials, grooming support, hotel services, and celebrations made with
            fur families in mind.
          </p>
        </div>
      </section>
    </div>
  );
}

export default About;
