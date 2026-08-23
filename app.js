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
const routeTableBody = document.querySelector("#routeTableBody");
const emptyStateTemplate = document.querySelector("#emptyStateTemplate");
const tourCount = document.querySelector("#tourCount");
const waterCount = document.querySelector("#waterCount");
const routeMapContainer = document.querySelector("#routeMap");
const routeMapPlaceholder = document.querySelector("#routeMapPlaceholder");
const selectedRouteLabel = document.querySelector("#selectedRouteLabel");

let waters = [];
let routes = [];
let currentRouteEditId = null;
let currentWaterEditId = null;
let selectedRouteId = null;
let geocodeCache = loadObjectStorage(STORAGE_KEYS.geocodeCache, {});
let routeMap = null;
let routeMarker = null;

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
  const [waterData, routeData] = await Promise.all([
    apiFetch("/api/waters"),
    apiFetch("/api/routes"),
  ]);

  waters = waterData;
  routes = routeData;
}

function formatDuration(start, end) {
  const diffMs = new Date(end) - new Date(start);
  if (Number.isNaN(diffMs) || diffMs <= 0) {
    return "";
  }

  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} h`;
}

function calculateSpeed(distance, start, end) {
  const diffMs = new Date(end) - new Date(start);
  const distanceValue = Number(distance);
  if (Number.isNaN(diffMs) || diffMs <= 0 || !distanceValue) {
    return "";
  }

  const hours = diffMs / 3600000;
  return `${(distanceValue / hours).toFixed(2)} km/h`;
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

function getFilteredRoutes() {
  const query = routeFilterForm.elements.query.value.trim().toLowerCase();
  const weatherFilter = routeFilterForm.elements.weather.value;
  const waterFilter = routeFilterForm.elements.waterBody.value;

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

    const matchesQuery = !query || haystack.includes(query);
    const matchesWeather = !weatherFilter || route.weather === weatherFilter;
    const matchesWater = !waterFilter || route.water_body === waterFilter;

    return matchesQuery && matchesWeather && matchesWater;
  });
}

function renderWaters() {
  if (waters.length === 0) {
    renderEmptyState(waterTableBody);
    updateStats();
    renderWaterSelect();
    renderRouteFilterWaterOptions();
    return;
  }

  waterTableBody.innerHTML = waters
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

  renderWaterSelect();
  renderRouteFilterWaterOptions();
  updateStats();
}

function renderRoutes() {
  const filteredRoutes = getFilteredRoutes();
  syncSelectedRoute();

  if (filteredRoutes.length === 0) {
    renderEmptyState(routeTableBody);
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
        <tr class="route-row ${route.id === selectedRouteId ? "is-selected" : ""}" data-select-route="${route.id}">
          <td>${escapeHtml(route.name)}</td>
          <td>${escapeHtml(route.distance_km)} km</td>
          <td>${escapeHtml(formatDateTime(route.start_time))}</td>
          <td>${escapeHtml(formatDateTime(route.end_time))}</td>
          <td>${escapeHtml(route.duration)}</td>
          <td>${escapeHtml(route.speed)}</td>
          <td>${route.temperature_c === null ? "-" : `${escapeHtml(route.temperature_c)} °C`}</td>
          <td>${escapeHtml(waterLabel)}</td>
          <td>${escapeHtml(route.weather)}</td>
          <td>${escapeHtml(route.wind || "-")}</td>
          <td><button class="secondary" type="button" data-edit-route="${route.id}">Bearbeiten</button></td>
          <td><button class="icon-button" type="button" data-delete-route="${route.id}">Löschen</button></td>
        </tr>
      `;
    })
    .join("");

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
  renderWaters();
  renderRoutes();
}

routeForm.addEventListener("input", updateCalculatedFields);
routeForm.addEventListener("change", updateCalculatedFields);

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
  };

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

  try {
    await refreshAndRender();
  } catch (error) {
    showMapPlaceholder("Die Anwendungsdaten konnten nicht geladen werden.");
    window.alert(error.message);
  }
}

initializeApp();
