const WEATHER_OPTIONS = [
  "Regen",
  "Sonne",
  "Gewitter",
  "Nebel",
  "leicht Bewölkt",
  "Bewölkt",
];

const WATER_TYPES = [
  "See",
  "Fluss",
  "WWFluss",
  "Meer-Küste",
  "Fjord",
  "Kanal",
  "Regattastrecke",
];

const STORAGE_KEYS = {
  geocodeCache: "paddle-geocode-cache",
};

const routeForm = document.querySelector("#routeForm");
const waterForm = document.querySelector("#waterForm");
const waterBodySelect = document.querySelector("#waterBodySelect");
const routeFilterForm = document.querySelector("#routeFilterForm");
const waterTableBody = document.querySelector("#waterTableBody");
const waterTableWrap = document.querySelector("#waterTableWrap");
const waterTableToggle = document.querySelector("#waterTableToggle");
const routeTableBody = document.querySelector("#routeTableBody");
const routeTagCloud = document.querySelector("#routeTagCloud");
const waterTagCloud = document.querySelector("#waterTagCloud");
const emptyStateTemplate = document.querySelector("#emptyStateTemplate");
const tourCount = document.querySelector("#tourCount");
const waterCount = document.querySelector("#waterCount");
const routeDistanceTotal = document.querySelector("#routeDistanceTotal");
const routeMapContainer = document.querySelector("#routeMap");
const routeMapPlaceholder = document.querySelector("#routeMapPlaceholder");
const selectedRouteLabel = document.querySelector("#selectedRouteLabel");
const entryMode = document.querySelector("#entryMode");
const trackChoice = document.querySelector("#trackChoice");
const trackFile = document.querySelector("#trackFile");

let waters = [];
let routes = [];
let currentRouteEditId = null;
let currentWaterEditId = null;
let selectedRouteId = null;
let showAllWaters = false;
let geocodeCache = loadObjectStorage(STORAGE_KEYS.geocodeCache, {});
let routeMap = null;
let routeMarker = null;
let tracks = [];

function loadObjectStorage(key, fallback) {
  const rawValue = localStorage.getItem(key);
  if (!rawValue) {
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }
}

function saveObjectStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = `Anfrage fehlgeschlagen: ${response.status}`;
    try {
      const error = await response.json();
      if (error.error) {
        message = error.error;
      }
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json();
}

async function loadData() {
  const [waterData, routeData, trackData] = await Promise.all([
    apiFetch("/api/waters"),
    apiFetch("/api/routes"),
    apiFetch("/api/tracks"),
  ]);

  waters = waterData;
  routes = routeData;
  tracks = trackData;
  trackFile.replaceChildren(new Option("Bitte auswählen", ""), ...tracks.map((track) => new Option(track.name, track.name)));
}

function calculateTrackValues(source) {
  const xml = new DOMParser().parseFromString(source, "application/xml");
  if (xml.querySelector("parsererror") || xml.documentElement?.localName !== "gpx") {
    throw new Error("Keine gültige GPX-Datei.");
  }
  const points = [...xml.getElementsByTagNameNS("*", "trkpt")];
  const timed = points.map((point) => ({
    point,
    date: new Date(point.getElementsByTagNameNS("*", "time")[0]?.textContent.trim()),
  })).filter(({ date }) => Number.isFinite(date.valueOf()));
  if (points.length < 2 || timed.length !== points.length || timed.length < 2) {
    throw new Error("Der Track enthält keine ausreichenden Zeitstempel.");
  }
  const radians = (value) => value * Math.PI / 180;
  const distanceBetween = (first, second) => {
    const lat1 = Number(first.getAttribute("lat"));
    const lon1 = Number(first.getAttribute("lon"));
    const lat2 = Number(second.getAttribute("lat"));
    const lon2 = Number(second.getAttribute("lon"));
    const dLat = radians(lat2 - lat1);
    const dLon = radians(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };
  const distance = points.slice(1).reduce((sum, point, index) => sum + distanceBetween(points[index], point), 0);
  const durationMs = timed.at(-1).date - timed[0].date;
  const duration = formatDuration(timed[0].date.toISOString(), timed.at(-1).date.toISOString());
  const speed = calculateSpeed(distance, timed[0].date.toISOString(), timed.at(-1).date.toISOString());
  return { distance, duration, speed, start: timed[0].date, end: timed.at(-1).date, durationMs };
}

async function loadTrackIntoForm(fileName) {
  if (!fileName) return;
  const response = await fetch(`/api/tracks/${encodeURIComponent(fileName)}`);
  if (!response.ok) throw new Error("Der Track konnte nicht geladen werden.");
  const values = calculateTrackValues(await response.text());
  routeForm.elements.distance.value = values.distance.toFixed(1);
  routeForm.elements.startTime.value = values.start.toISOString().slice(0, 16);
  routeForm.elements.endTime.value = values.end.toISOString().slice(0, 16);
  routeForm.elements.duration.value = values.duration;
  routeForm.elements.speed.value = values.speed;
}

function formatDuration(start, end) {
  const diffMs = new Date(end) - new Date(start);
  if (Number.isNaN(diffMs) || diffMs <= 0) {
    return "";
  }

  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function calculateSpeed(distance, start, end) {
  const diffMs = new Date(end) - new Date(start);
  const distanceValue = Number(distance);
  if (Number.isNaN(diffMs) || diffMs <= 0 || !distanceValue) {
    return "";
  }

  const hours = diffMs / 3600000;
  return `${(distanceValue / hours).toFixed(2)}`;
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderEmptyState(target) {
  target.innerHTML = "";
  target.append(emptyStateTemplate.content.cloneNode(true));
}

function getWaterById(waterId) {
  return waters.find((entry) => entry.id === waterId) || null;
}

function syncSelectedRoute() {
  const hasSelection = routes.some((route) => route.id === selectedRouteId);
  if (hasSelection) {
    return;
  }

  selectedRouteId = routes[0]?.id || null;
}

function ensureMap() {
  if (routeMap || !window.L) {
    return;
  }

  routeMap = L.map("routeMap", {
    zoomControl: true,
  }).setView([51.1657, 10.4515], 6);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(routeMap);
}

function showMapPlaceholder(message) {
  routeMapPlaceholder.hidden = false;
  routeMapPlaceholder.textContent = message;
  routeMapContainer.classList.remove("is-visible");
}

function hideMapPlaceholder() {
  routeMapPlaceholder.hidden = true;
  routeMapContainer.classList.add("is-visible");
}

function setMapPosition(lat, lon, label) {
  ensureMap();
  if (!routeMap) {
    return;
  }

  hideMapPlaceholder();
  const markerPosition = L.latLng(lat, lon);
  routeMap.setView(markerPosition, 11, { animate: false });

  if (!routeMarker) {
    routeMarker = L.marker(markerPosition).addTo(routeMap);
  } else {
    routeMarker.setLatLng(markerPosition);
  }

  routeMarker.bindPopup(label).openPopup();
  setTimeout(() => {
    routeMap.invalidateSize();
    routeMap.panTo(markerPosition, { animate: false });
  }, 0);
}

async function geocodeWater(water) {
  const cacheKey = `${water.name}|${water.country}|${water.type}`;
  if (geocodeCache[cacheKey]) {
    return geocodeCache[cacheKey];
  }

  const query = encodeURIComponent(`${water.name}, ${water.country}`);
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${query}`,
    {
      headers: { Accept: "application/json" },
    }
  );

  if (!response.ok) {
    throw new Error(`Geocoding fehlgeschlagen: ${response.status}`);
  }

  const results = await response.json();
  const match = results[0];
  if (!match) {
    return null;
  }

  const geocode = {
    lat: Number(match.lat),
    lon: Number(match.lon),
    displayName: match.display_name,
  };
  geocodeCache[cacheKey] = geocode;
  saveObjectStorage(STORAGE_KEYS.geocodeCache, geocodeCache);
  return geocode;
}

async function updateMapCard() {
  const selectedRoute = routes.find((route) => route.id === selectedRouteId);
  if (!selectedRoute) {
    selectedRouteLabel.textContent = "Noch keine Strecke ausgewählt";
    showMapPlaceholder("Wähle unten eine Strecke aus, damit das zugehörige Gewässer auf der Karte angezeigt wird.");
    return;
  }

  const water = getWaterById(selectedRoute.water_body);
  const waterQuery = water ? `${water.name}, ${water.country}` : "";
  selectedRouteLabel.textContent = `${selectedRoute.name} · ${waterQuery || "ohne Gewässer"}`;

  if (!water) {
    showMapPlaceholder("Zur ausgewählten Strecke ist aktuell kein gültiges Gewässer hinterlegt.");
    return;
  }

  showMapPlaceholder("Position des Gewässers wird geladen...");

  try {
    const geocode = await geocodeWater(water);
    if (!geocode) {
      showMapPlaceholder("Für dieses Gewässer konnte keine passende Position gefunden werden.");
      return;
    }

    const popupLabel = `${selectedRoute.name}<br>${geocode.displayName}`;
    setMapPosition(geocode.lat, geocode.lon, popupLabel);
  } catch {
    showMapPlaceholder("Die Kartenposition konnte gerade nicht geladen werden.");
  }
}

function updateStats() {
  tourCount.textContent = routes.length;
  waterCount.textContent = waters.length;
}

function syncFormButtonLabels() {
  const routeSubmitButton = routeForm.querySelector('button[type="submit"]');
  const waterSubmitButton = waterForm.querySelector('button[type="submit"]');
  routeSubmitButton.textContent = currentRouteEditId ? "Strecke aktualisieren" : "Strecke speichern";
  waterSubmitButton.textContent = currentWaterEditId ? "Gewässer aktualisieren" : "Gewässer speichern";
}

function renderWaterSelect() {
  const currentValue = waterBodySelect.value;
  waterBodySelect.innerHTML = '<option value="">Bitte auswählen</option>';

  waters.forEach((water) => {
    const option = document.createElement("option");
    option.value = water.id;
    option.textContent = `${water.name} (${water.country}, ${water.type})`;
    waterBodySelect.append(option);
  });

  if (waters.some((water) => water.id === currentValue)) {
    waterBodySelect.value = currentValue;
  }
}

function renderRouteFilterWaterOptions() {
  const filterSelect = routeFilterForm.elements.waterBody;
  const currentValue = filterSelect.value;
  filterSelect.innerHTML = '<option value="">Alle Gewässer</option>';

  waters.forEach((water) => {
    const option = document.createElement("option");
    option.value = water.id;
    option.textContent = `${water.name} (${water.country}, ${water.type})`;
    filterSelect.append(option);
  });

  if (waters.some((water) => water.id === currentValue)) {
    filterSelect.value = currentValue;
  }
}

function getMonthLabel(monthIndex) {
  return new Intl.DateTimeFormat("de-DE", { month: "long" }).format(new Date(2024, monthIndex, 1));
}

function populateRouteDateFilters() {
  const yearSelect = routeFilterForm.elements.year;
  const monthSelect = routeFilterForm.elements.month;
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const years = [...new Set(routes.map((route) => {
    const date = route.start_time ? new Date(route.start_time) : null;
    return date && Number.isFinite(date.valueOf()) ? date.getFullYear() : null;
  }).filter((value) => value !== null))].sort((a, b) => b - a);

  yearSelect.innerHTML = '<option value="">Alle Jahre</option>' + years.map((year) => `<option value="${year}">${year}</option>`).join("");

  monthSelect.innerHTML = '<option value="">Alle Monate</option>' + Array.from({ length: 12 }, (_, index) => `
    <option value="${index}">${getMonthLabel(index)}</option>
  `).join("");

  const defaultYear = yearSelect.value || String(currentYear);
  const defaultMonth = monthSelect.value || String(currentMonth);
  yearSelect.value = defaultYear;
  monthSelect.value = defaultMonth;

  if (!yearSelect.value) {
    yearSelect.value = String(currentYear);
  }
  if (!monthSelect.value) {
    monthSelect.value = String(currentMonth);
  }
}

function getFilteredRoutes() {
  const query = routeFilterForm.elements.query.value.trim().toLowerCase();
  const weatherFilter = routeFilterForm.elements.weather.value;
  const waterFilter = routeFilterForm.elements.waterBody.value;
  const yearFilter = routeFilterForm.elements.year.value;
  const monthFilter = routeFilterForm.elements.month.value;

  return routes.filter((route) => {
    const water = waters.find((entry) => entry.id === route.water_body);
    const waterLabel = water ? `${water.name} ${water.country} ${water.type}`.toLowerCase() : "";
    const haystack = [
      route.name,
      route.weather,
      route.wind,
      route.distance_km,
      route.temperature_c,
      waterLabel,
    ]
      .join(" ")
      .toLowerCase();

    const routeDate = route.start_time ? new Date(route.start_time) : null;
    const matchesQuery = !query || haystack.includes(query);
    const matchesWeather = !weatherFilter || route.weather === weatherFilter;
    const matchesWater = !waterFilter || route.water_body === waterFilter;
    const matchesYear = !yearFilter || (routeDate && Number.isFinite(routeDate.valueOf()) && routeDate.getFullYear() === Number(yearFilter));
    const matchesMonth = !monthFilter || (routeDate && Number.isFinite(routeDate.valueOf()) && routeDate.getMonth() === Number(monthFilter));

    return matchesQuery && matchesWeather && matchesWater && matchesYear && matchesMonth;
  });
}

function renderWaters() {
  const sortedWaters = waters
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  const visibleWaters = showAllWaters ? sortedWaters : sortedWaters.slice(0, 6);

  if (sortedWaters.length === 0) {
    renderEmptyState(waterTableBody);
    if (waterTableToggle) {
      waterTableToggle.hidden = true;
    }
    if (waterTableWrap) {
      waterTableWrap.classList.remove("is-expanded");
    }
    updateStats();
    renderWaterSelect();
    renderRouteFilterWaterOptions();
    return;
  }

  waterTableBody.innerHTML = visibleWaters
    .map(
      (water) => `
        <tr>
          <td>${escapeHtml(water.name)}</td>
          <td>${escapeHtml(water.country)}</td>
          <td>${escapeHtml(water.type)}</td>
          <td><button class="secondary" type="button" data-edit-water="${water.id}">Bearbeiten</button></td>
          <td><button class="icon-button" type="button" data-delete-water="${water.id}">Löschen</button></td>
        </tr>
      `
    )
    .join("");

  if (waterTableToggle) {
    waterTableToggle.hidden = sortedWaters.length <= 6;
    waterTableToggle.textContent = showAllWaters ? "weniger anzeigen" : "alle anzeigen";
  }

  if (waterTableWrap) {
    waterTableWrap.classList.toggle("is-expanded", showAllWaters && sortedWaters.length > 6);
  }

  renderWaterSelect();
  renderRouteFilterWaterOptions();
  updateStats();
}

function renderRouteTagCloud() {
  if (!routeTagCloud) {
    return;
  }

  if (routes.length === 0) {
    routeTagCloud.innerHTML = '<span class="route-tag-empty">Noch keine Strecken</span>';
    return;
  }

  const recentRoutes = routes
    .slice()
    .sort((a, b) => {
      const left = new Date(a.start_time || 0).getTime();
      const right = new Date(b.start_time || 0).getTime();
      return right - left || a.name.localeCompare(b.name, "de");
    })
    .slice(0, 6);

  routeTagCloud.innerHTML = recentRoutes
    .map((route, index) => {
      const baseSize = 1.0 + (index % 4) * 0.08;
      const lengthPenalty = Math.min(route.name.length / 42, 0.28);
      const size = baseSize - lengthPenalty;
      return `
        <a
          href="#route-${route.id}"
          class="${route.id === selectedRouteId ? "is-active" : ""}"
          data-select-route-link="${route.id}"
          style="font-size: ${Math.max(size, 0.9).toFixed(2)}rem;"
        >${escapeHtml(route.name)}</a>
      `;
    })
    .join("");
}

function renderWaterTagCloud() {
  if (!waterTagCloud) {
    return;
  }

  if (waters.length === 0) {
    waterTagCloud.innerHTML = '<span class="water-tag-empty">Noch keine Gewässer</span>';
    waterTagCloud.classList.remove("is-expanded");
    return;
  }

  const currentWaterFilter = routeFilterForm.elements.waterBody.value;
  const sortedWaters = waters
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  const visibleWaters = showAllWaters ? sortedWaters : sortedWaters.slice(0, 6);

  waterTagCloud.innerHTML = [
    visibleWaters
      .map((water, index) => {
        const size = 0.9 + (index % 4) * 0.14 + Math.min(water.name.length / 30, 0.35);
        return `
          <a
            href="#water-${water.id}"
            class="${water.id === currentWaterFilter ? "is-active" : ""}"
            data-select-water-link="${water.id}"
            style="font-size: ${size.toFixed(2)}rem;"
          >${escapeHtml(water.name)}</a>
        `;
      })
      .join(""),
    !showAllWaters && sortedWaters.length > 6
      ? '<button type="button" class="tag-cloud-toggle" data-toggle-water-cloud>alle anzeigen</button>'
      : "",
  ].join("");

  waterTagCloud.classList.toggle("is-expanded", showAllWaters && sortedWaters.length > 6);
}

function renderRoutes() {
  const filteredRoutes = getFilteredRoutes();
  const totalDistance = filteredRoutes.reduce((sum, route) => sum + (Number(route.distance_km) || 0), 0);
  routeDistanceTotal.textContent = `${totalDistance.toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km`;
  syncSelectedRoute();

  if (filteredRoutes.length === 0) {
    renderEmptyState(routeTableBody);
    renderRouteTagCloud();
    renderWaterTagCloud();
    updateStats();
    updateMapCard();
    return;
  }

  routeTableBody.innerHTML = filteredRoutes
    .map((route) => {
      const water = waters.find((entry) => entry.id === route.water_body);
      const waterLabel = water
        ? `${water.name} (${water.country}, ${water.type})`
        : "nicht mehr vorhanden";

      return `
        <tr id="route-${route.id}" class="route-row ${route.id === selectedRouteId ? "is-selected" : ""}" data-select-route="${route.id}">
          <td>${escapeHtml(route.name)}</td>
          <td>${escapeHtml(route.distance_km)}</td>
          <td>${escapeHtml(formatDateTime(route.start_time))}</td>
          <td>${escapeHtml(formatDateTime(route.end_time))}</td>
          <td>${escapeHtml(route.duration)}</td>
          <td>${escapeHtml(route.speed)}</td>
          <td>${route.temperature_c === null ? "-" : `${escapeHtml(route.temperature_c)}`}</td>
          <td>${escapeHtml(waterLabel)}</td>
          <td>${escapeHtml(route.weather)}</td>
          <td>${escapeHtml(route.wind || "-")}</td>
          <td>${route.track_file ? `<a href="/track-analyse.html?track=${encodeURIComponent(route.track_file)}">${escapeHtml(route.track_file)}</a>` : "-"}</td>
          <td><button class="secondary" type="button" data-edit-route="${route.id}">Bearbeiten</button></td>
          <td><button class="icon-button" type="button" data-delete-route="${route.id}">Löschen</button></td>
        </tr>
      `;
    })
    .join("");

  renderRouteTagCloud();
  renderWaterTagCloud();
  updateStats();
  updateMapCard();
}

function updateCalculatedFields() {
  const formData = new FormData(routeForm);
  const startTime = formData.get("startTime");
  const endTime = formData.get("endTime");
  const distance = formData.get("distance");

  routeForm.elements.duration.value = formatDuration(startTime, endTime);
  routeForm.elements.speed.value = calculateSpeed(distance, startTime, endTime);
}

function clearRouteEditState() {
  currentRouteEditId = null;
  syncFormButtonLabels();
}

function clearWaterEditState() {
  currentWaterEditId = null;
  syncFormButtonLabels();
}

function fillRouteForm(route) {
  routeForm.elements.name.value = route.name;
  routeForm.elements.distance.value = route.distance_km;
  routeForm.elements.startTime.value = route.start_time;
  routeForm.elements.endTime.value = route.end_time;
  routeForm.elements.temperature.value = route.temperature_c ?? "";
  routeForm.elements.waterBody.value = route.water_body ?? "";
  routeForm.elements.weather.value = route.weather;
  routeForm.elements.wind.value = route.wind ?? "";
  entryMode.value = route.track_file ? "track" : "manual";
  trackChoice.hidden = !route.track_file;
  trackFile.value = route.track_file ?? "";
  updateCalculatedFields();
}

function fillWaterForm(water) {
  waterForm.elements.name.value = water.name;
  waterForm.elements.country.value = water.country;
  waterForm.elements.type.value = water.type;
}

function ensureWeatherAndTypeOptions() {
  const weatherSelect = routeForm.elements.weather;
  if (weatherSelect.options.length <= 1) {
    WEATHER_OPTIONS.forEach((option) => {
      const entry = document.createElement("option");
      entry.value = option;
      entry.textContent = option;
      weatherSelect.append(entry);
    });
  }

  const filterWeatherSelect = routeFilterForm.elements.weather;
  if (filterWeatherSelect.options.length <= 1) {
    WEATHER_OPTIONS.forEach((option) => {
      const entry = document.createElement("option");
      entry.value = option;
      entry.textContent = option;
      filterWeatherSelect.append(entry);
    });
  }

  const typeSelect = waterForm.elements.type;
  if (typeSelect.options.length <= 1) {
    WATER_TYPES.forEach((option) => {
      const entry = document.createElement("option");
      entry.value = option;
      entry.textContent = option;
      typeSelect.append(entry);
    });
  }
}

async function refreshAndRender() {
  await loadData();
  populateRouteDateFilters();
  renderWaters();
  renderRoutes();
}

routeForm.addEventListener("input", updateCalculatedFields);
routeForm.addEventListener("change", updateCalculatedFields);
entryMode.addEventListener("change", () => {
  trackChoice.hidden = entryMode.value !== "track";
  if (entryMode.value === "manual") trackFile.value = "";
});
trackFile.addEventListener("change", async () => {
  try {
    await loadTrackIntoForm(trackFile.value);
  } catch (error) {
    window.alert(error.message);
  }
});

routeForm.addEventListener("reset", () => {
  requestAnimationFrame(() => {
    clearRouteEditState();
    routeForm.elements.duration.value = "";
    routeForm.elements.speed.value = "";
  });
});

routeForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(routeForm);
  const duration = formatDuration(formData.get("startTime"), formData.get("endTime"));
  const speed = calculateSpeed(
    formData.get("distance"),
    formData.get("startTime"),
    formData.get("endTime")
  );

  if (!duration || !speed) {
    window.alert("Endzeit muss nach der Startzeit liegen und die Distanz größer als 0 sein.");
    return;
  }

  const routePayload = {
    name: formData.get("name").trim(),
    distance_km: Number(formData.get("distance")).toFixed(1),
    start_time: formData.get("startTime"),
    end_time: formData.get("endTime"),
    duration,
    speed,
    temperature_c: formData.get("temperature") ? Number(formData.get("temperature")).toFixed(1) : null,
    water_body: formData.get("waterBody"),
    weather: formData.get("weather"),
    wind: formData.get("wind").trim(),
    track_file: entryMode.value === "track" ? formData.get("trackFile") : null,
  };

  if (entryMode.value === "track" && !routePayload.track_file) {
    window.alert("Bitte einen Track auswählen.");
    return;
  }

  try {
    if (currentRouteEditId) {
      await apiFetch(`/api/routes/${currentRouteEditId}`, {
        method: "PUT",
        body: JSON.stringify(routePayload),
      });
      selectedRouteId = currentRouteEditId;
    } else {
      const createdRoute = await apiFetch("/api/routes", {
        method: "POST",
        body: JSON.stringify(routePayload),
      });
      selectedRouteId = createdRoute.id;
    }

    await refreshAndRender();
    routeForm.reset();
  } catch (error) {
    window.alert(error.message);
  }
});

waterForm.addEventListener("reset", () => {
  requestAnimationFrame(() => {
    clearWaterEditState();
  });
});

waterForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(waterForm);
  const waterPayload = {
    name: formData.get("name").trim(),
    country: formData.get("country").trim(),
    type: formData.get("type"),
  };

  try {
    if (currentWaterEditId) {
      await apiFetch(`/api/waters/${currentWaterEditId}`, {
        method: "PUT",
        body: JSON.stringify(waterPayload),
      });
    } else {
      await apiFetch("/api/waters", {
        method: "POST",
        body: JSON.stringify(waterPayload),
      });
    }

    await refreshAndRender();
    waterForm.reset();
  } catch (error) {
    window.alert(error.message);
  }
});

routeFilterForm.addEventListener("input", () => {
  renderRoutes();
});

routeFilterForm.addEventListener("change", () => {
  renderRoutes();
});

routeFilterForm.addEventListener("reset", () => {
  requestAnimationFrame(() => {
    const now = new Date();
    routeFilterForm.elements.year.value = String(now.getFullYear());
    routeFilterForm.elements.month.value = String(now.getMonth());
    renderRoutes();
  });
});

waterTableBody.addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-edit-water]");
  if (editButton) {
    const water = waters.find((entry) => entry.id === editButton.dataset.editWater);
    if (!water) {
      return;
    }

    currentWaterEditId = water.id;
    fillWaterForm(water);
    syncFormButtonLabels();
    waterForm.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const deleteButton = event.target.closest("[data-delete-water]");
  if (!deleteButton) {
    return;
  }

  try {
    await apiFetch(`/api/waters/${deleteButton.dataset.deleteWater}`, {
      method: "DELETE",
    });
    if (currentWaterEditId === deleteButton.dataset.deleteWater) {
      waterForm.reset();
    }
    await refreshAndRender();
  } catch (error) {
    window.alert(error.message);
  }
});

routeTagCloud.addEventListener("click", (event) => {
  const tagLink = event.target.closest("[data-select-route-link]");
  if (!tagLink) {
    return;
  }

  event.preventDefault();
  const routeId = tagLink.dataset.selectRouteLink;
  const isCurrentlySelected = selectedRouteId === routeId;

  selectedRouteId = isCurrentlySelected ? null : routeId;
  renderRoutes();

  if (isCurrentlySelected) {
    return;
  }

  const routeRow = document.querySelector(`#route-${routeId}`);
  if (routeRow) {
    routeRow.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});

waterTableToggle.addEventListener("click", () => {
  showAllWaters = !showAllWaters;
  renderWaters();
  renderWaterTagCloud();
});

waterTagCloud.addEventListener("click", (event) => {
  const toggleButton = event.target.closest("[data-toggle-water-cloud]");
  if (toggleButton) {
    event.preventDefault();
    showAllWaters = true;
    renderWaters();
    renderWaterTagCloud();
    return;
  }

  const tagLink = event.target.closest("[data-select-water-link]");
  if (!tagLink) {
    return;
  }

  event.preventDefault();
  const waterId = tagLink.dataset.selectWaterLink;
  const isCurrentlySelected = routeFilterForm.elements.waterBody.value === waterId;

  routeFilterForm.elements.waterBody.value = isCurrentlySelected ? "" : waterId;
  renderRoutes();
  renderWaterTagCloud();

  if (isCurrentlySelected) {
    return;
  }

  const routeRows = [...document.querySelectorAll("[data-select-route]")];
  const firstVisibleRoute = routeRows.find((row) => row.closest("tr") && row.closest("tr").dataset.selectRoute);
  if (firstVisibleRoute) {
    selectedRouteId = firstVisibleRoute.dataset.selectRoute;
    renderRoutes();
  }
});

routeTableBody.addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-edit-route]");
  if (editButton) {
    const route = routes.find((entry) => entry.id === editButton.dataset.editRoute);
    if (!route) {
      return;
    }

    currentRouteEditId = route.id;
    fillRouteForm(route);
    syncFormButtonLabels();
    routeForm.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const deleteButton = event.target.closest("[data-delete-route]");
  if (deleteButton) {
    try {
      await apiFetch(`/api/routes/${deleteButton.dataset.deleteRoute}`, {
        method: "DELETE",
      });
      if (currentRouteEditId === deleteButton.dataset.deleteRoute) {
        routeForm.reset();
      }
      if (selectedRouteId === deleteButton.dataset.deleteRoute) {
        selectedRouteId = null;
      }
      await refreshAndRender();
    } catch (error) {
      window.alert(error.message);
    }
    return;
  }

  const row = event.target.closest("[data-select-route]");
  if (row) {
    selectedRouteId = row.dataset.selectRoute;
    renderRoutes();
  }
});

async function initializeApp() {
  ensureWeatherAndTypeOptions();
  syncFormButtonLabels();
  updateCalculatedFields();

  const now = new Date();
  if (routeFilterForm) {
    routeFilterForm.elements.year.value = String(now.getFullYear());
    routeFilterForm.elements.month.value = String(now.getMonth());
  }

  try {
    await refreshAndRender();
  } catch (error) {
    showMapPlaceholder("Die Anwendungsdaten konnten nicht geladen werden.");
    window.alert(error.message);
  }
}

initializeApp();
