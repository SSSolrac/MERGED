import { useEffect, useState } from "react";
import HeroSlider from "../components/HeroSlider";
import CampaignBanner from "../components/CampaignBanner";
import MenuBelt from "../components/MenuBelt";
import MenuOfTheDay from "../components/dailyMenu/MenuOfTheDay";
import { Link } from "react-router-dom";
import aboutUsStorefront from "../assets/about/about-us-storefront.jpg";
import "../components/dailyMenu/MenuOfTheDay.css";
import "./Home.css";
import { getCurrentDailyMenu } from "../services/dailyMenuService";

export default function Home({ onOrderClick }) {
  const [dailyMenu, setDailyMenu] = useState(null);
  const [isLoadingMenu, setIsLoadingMenu] = useState(true);

  useEffect(() => {
    const loadDailyMenu = async () => {
      const data = await getCurrentDailyMenu();
      setDailyMenu(data);
      setIsLoadingMenu(false);
    };

    loadDailyMenu();
  }, []);

  return (
    <>
      <div style={{ position: "relative" }}>
        <CampaignBanner overlay />
        <HeroSlider onOrderClick={onOrderClick} />
      </div>
      {isLoadingMenu ? (
        <section className="daily-menu" aria-label="Menu of the Day loading">
          <p className="daily-menu__empty">Loading menu of the day...</p>
        </section>
      ) : (
        <MenuOfTheDay menuData={dailyMenu} />
      )}
      <MenuBelt />
      <section className="home-about-teaser" aria-labelledby="home-about-title">
        <div className="home-about-teaser__inner">
          <div className="home-about-teaser__media">
            <img src={aboutUsStorefront} alt="Happy Tails Pet Cafe storefront in Lucena City" />
          </div>

          <div className="home-about-teaser__content">
            <p className="home-about-teaser__eyebrow">Happy Tails Pet Cafe</p>
            <h2 id="home-about-title">A cozy cafe made for fur parents and friends.</h2>
            <p>
              Step into a cheerful pet-friendly space in Lucena where handcrafted drinks, cafe favorites, and love for
              animals meet. Happy Tails is built for slow afternoons, small celebrations, and everyday moments shared
              with the pets who make life sweeter.
            </p>
            <div className="home-about-teaser__actions">
              <Link className="home-about-teaser__button" to="/about">
                About Us
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
