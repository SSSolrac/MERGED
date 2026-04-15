import "./MenuOfTheDay.css";

function MenuOfTheDay({ menuData }) {
  const hasCategories =
    menuData?.isActive &&
    Array.isArray(menuData?.categories) &&
    menuData.categories.some((category) => category.items?.length);

  if (!hasCategories) {
    return (
      <section className="daily-menu" aria-label="Menu of the Day">
        <div className="daily-menu__header">
          <h2>{menuData?.title || "Menu of the Day"}</h2>
          <p>{menuData?.subtitle || "Available today"}</p>
        </div>

        <p className="daily-menu__empty">
          Today&apos;s chef picks are not published yet. You can still order from the full menu below.
        </p>
      </section>
    );
  }

  return (
    <section className="daily-menu" aria-label="Menu of the Day">
      <div className="daily-menu__header">
        <h2>{menuData.title}</h2>
        <p>{menuData.subtitle}</p>
        <small>{new Date(menuData.date).toLocaleDateString()}</small>
      </div>

      <div className="daily-menu__categories">
        {menuData.categories.map((category) => (
          <article className="daily-menu__category" key={category.name}>
            <h3>{category.name}</h3>
            <ul>
              {category.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

export default MenuOfTheDay;
