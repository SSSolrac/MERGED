export const LUCENA_CITY_LABEL = "Lucena City";
export const LUCENA_PROVINCE_LABEL = "Quezon";
export const LUCENA_COUNTRY_LABEL = "Philippines";

export const LUCENA_BARANGAYS = ["Ilayang Iyam"];

// Verified Ilayang Iyam puroks from public Lucena tender/news postings.
export const LUCENA_PUROKS_BY_BARANGAY = {
  "Ilayang Iyam": ["Purok Pinagbuklod", "Purok Carmelita", "Purok Sampaguita"],
};

const LUCENA_PUROK_ALIASES_BY_BARANGAY = {
  "Ilayang Iyam": {
    "pinagbuklod": "Purok Pinagbuklod",
    "purok pinagbuklod": "Purok Pinagbuklod",
    "carmelita": "Purok Carmelita",
    "carmelitas": "Purok Carmelita",
    "purok carmelita": "Purok Carmelita",
    "purok carmelitas": "Purok Carmelita",
    "sampaguita": "Purok Sampaguita",
    "purok sampaguita": "Purok Sampaguita",
  },
};

function normalizeValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function findLucenaBarangay(value) {
  const normalized = normalizeValue(value);
  if (!normalized) return "";

  const match = LUCENA_BARANGAYS.find((barangay) => normalizeValue(barangay) === normalized);
  return match || "";
}

export function getPuroksForBarangay(barangay) {
  const canonicalBarangay = findLucenaBarangay(barangay);
  if (!canonicalBarangay) return [];
  return Array.isArray(LUCENA_PUROKS_BY_BARANGAY[canonicalBarangay]) ? LUCENA_PUROKS_BY_BARANGAY[canonicalBarangay] : [];
}

export function findLucenaPurok(barangay, purok) {
  const normalized = normalizeValue(purok);
  if (!normalized) return "";
  const canonicalBarangay = findLucenaBarangay(barangay);
  const availablePuroks = getPuroksForBarangay(canonicalBarangay);
  const match = availablePuroks.find((item) => normalizeValue(item) === normalized);
  if (match) return match;

  const aliases = LUCENA_PUROK_ALIASES_BY_BARANGAY[canonicalBarangay] || {};
  return aliases[normalized] || "";
}

export function composeLucenaAddress({ houseDetails, purok, barangay }) {
  const safeHouseDetails = String(houseDetails || "").trim();
  const canonicalBarangay = findLucenaBarangay(barangay);
  const canonicalPurok = findLucenaPurok(canonicalBarangay, purok);

  if (!safeHouseDetails || !canonicalBarangay || !canonicalPurok) return "";
  return `${safeHouseDetails}, ${canonicalPurok}, ${canonicalBarangay}, ${LUCENA_CITY_LABEL}, ${LUCENA_PROVINCE_LABEL}, ${LUCENA_COUNTRY_LABEL}`;
}

export function parseLucenaAddress(address) {
  const rawAddress = String(address || "").trim();
  if (!rawAddress) return { houseDetails: "", purok: "", barangay: "" };

  const segments = rawAddress
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);

  let matchedBarangay = "";
  for (const segment of segments) {
    const exactMatch = findLucenaBarangay(segment);
    if (exactMatch) {
      matchedBarangay = exactMatch;
      break;
    }
  }

  if (!matchedBarangay) {
    const lowerAddress = rawAddress.toLowerCase();
    const sortedBarangays = [...LUCENA_BARANGAYS].sort((left, right) => right.length - left.length);
    matchedBarangay =
      sortedBarangays.find((barangay) => {
        const lowerBarangay = barangay.toLowerCase();
        const escaped = lowerBarangay.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`);
        return pattern.test(lowerAddress);
      }) || "";
  }

  const candidatePuroks = matchedBarangay ? getPuroksForBarangay(matchedBarangay) : [];

  let matchedPurok = "";
  for (const segment of segments) {
    const canonicalMatch = findLucenaPurok(matchedBarangay, segment);
    if (canonicalMatch) {
      matchedPurok = canonicalMatch;
      break;
    }
  }

  if (!matchedPurok && candidatePuroks.length) {
    const lowerAddress = rawAddress.toLowerCase();
    const sortedPuroks = [...candidatePuroks].sort((left, right) => right.length - left.length);
    matchedPurok =
      sortedPuroks.find((purok) => {
        const lowerPurok = purok.toLowerCase();
        const escaped = lowerPurok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`);
        return pattern.test(lowerAddress);
      }) || "";
  }

  if (!matchedPurok && matchedBarangay) {
    const lowerAddress = rawAddress.toLowerCase();
    const aliases = Object.entries(LUCENA_PUROK_ALIASES_BY_BARANGAY[matchedBarangay] || {}).sort(
      (left, right) => right[0].length - left[0].length
    );
    for (const [alias, canonicalPurok] of aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`);
      if (pattern.test(lowerAddress)) {
        matchedPurok = canonicalPurok;
        break;
      }
    }
  }

  let houseDetails = "";
  const lowerAddress = rawAddress.toLowerCase();
  const markerCandidates = [matchedPurok, matchedBarangay]
    .map((marker) => {
      if (!marker) return -1;
      return lowerAddress.indexOf(marker.toLowerCase());
    })
    .filter((index) => index > -1)
    .sort((left, right) => left - right);

  const markerIndex = markerCandidates[0] ?? -1;
  if (markerIndex > -1) {
    houseDetails = rawAddress.slice(0, markerIndex).replace(/[,\s-]+$/, "").trim();
  }

  if (!houseDetails) {
    const firstSegment = String(rawAddress.split(",")[0] || "").trim();
    const isBarangaySegment = normalizeValue(firstSegment) === normalizeValue(matchedBarangay);
    const isPurokSegment = normalizeValue(firstSegment) === normalizeValue(matchedPurok);
    houseDetails = isBarangaySegment || isPurokSegment ? "" : firstSegment;
  }

  return {
    houseDetails,
    purok: matchedPurok,
    barangay: matchedBarangay,
  };
}
