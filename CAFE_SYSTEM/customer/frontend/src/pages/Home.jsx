import { useEffect, useState } from "react";
import HeroSlider from "../components/HeroSlider";
import MenuBelt from "../components/MenuBelt";
import MenuOfTheDay from "../components/dailyMenu/MenuOfTheDay";
import "../components/dailyMenu/MenuOfTheDay.css";
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
      <HeroSlider onOrderClick={onOrderClick} />
      {isLoadingMenu ? (
        <section className="daily-menu" aria-label="Menu of the Day loading">
          <p className="daily-menu__empty">Loading menu of the day...</p>
        </section>
      ) : (
        <MenuOfTheDay menuData={dailyMenu} />
      )}
      <MenuBelt />
    </>
  );
}
