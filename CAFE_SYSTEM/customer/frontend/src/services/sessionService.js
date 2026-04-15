export function clearAllSessionData(prefix = "happyTails") {
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith(prefix)) localStorage.removeItem(key);
  });
}

