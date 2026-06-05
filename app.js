const state = {
  people: [],
  events: [],
  sort: "date",
  recording: {
    mediaRecorder: null,
    chunks: [],
    blob: null,
    url: "",
  },
  tableRecording: {
    personId: "",
    mediaRecorder: null,
    chunks: [],
  },
  apolloPersonId: null,
  dragEventId: "",
  orderDirty: false,
  expandedPeople: new Set(),
  formTranscript: "",
  eventPeopleEventId: "",
  eventPeopleExpandedIds: new Set(),
  eventPeopleMessages: {},
  eventPeopleGeneratingId: "",
};

const els = {
  status: document.getElementById("status"),
  eventForm: document.getElementById("event-form"),
  eventName: document.getElementById("event-name"),
  eventDate: document.getElementById("event-date"),
  eventsOpenSecondary: document.getElementById("events-open-secondary"),
  eventsDialog: document.getElementById("events-dialog"),
  eventsClose: document.getElementById("events-close"),
  eventOrderList: document.getElementById("event-order-list"),
  eventPicker: document.getElementById("event-picker"),
  eventBoard: document.getElementById("event-board"),
  eventPeopleDialog: document.getElementById("event-people-dialog"),
  eventPeopleClose: document.getElementById("event-people-close"),
  eventPeopleTitle: document.getElementById("event-people-title"),
  eventPeopleMeta: document.getElementById("event-people-meta"),
  eventPeopleList: document.getElementById("event-people-list"),
  personForm: document.getElementById("person-form"),
  peopleBody: document.getElementById("people-body"),
  metDate: document.getElementById("met-date"),
  recordButton: document.getElementById("record-button"),
  stopButton: document.getElementById("stop-button"),
  clearAudioButton: document.getElementById("clear-audio-button"),
  formTranscribeButton: document.getElementById("form-transcribe-button"),
  description: document.getElementById("description"),
  formTranscriptBox: document.getElementById("form-transcript-box"),
  appendFormTranscriptButton: document.getElementById("append-form-transcript"),
  recordingState: document.getElementById("recording-state"),
  audioPreview: document.getElementById("audio-preview"),
  apolloDialog: document.getElementById("apollo-dialog"),
  apolloClose: document.getElementById("apollo-close"),
  apolloStatus: document.getElementById("apollo-status"),
  apolloResults: document.getElementById("apollo-results"),
};

function today() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setStatus(message, isError = false) {
  els.status.textContent = message || "";
  els.status.className = isError ? "status error" : "status";
}

function setApolloStatus(message, isError = false) {
  els.apolloStatus.textContent = message || "";
  els.apolloStatus.className = isError ? "dialog-status error" : "dialog-status";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[char]);
}

function icon(name) {
  const icons = {
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4z"></path><path d="m4 7 8 6 8-6"></path></svg>',
    linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M8 10v7"></path><path d="M8 7.2v.1"></path><path d="M12 17v-4.2a2.5 2.5 0 0 1 5 0V17"></path><path d="M12 10v7"></path></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="4"></rect><circle cx="12" cy="12" r="3.2"></circle><path d="M16.5 7.8v.1"></path></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"></path></svg>',
    mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0"></path><path d="M12 18v3"></path></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1"></rect></svg>',
    clear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12"></path><path d="M18 6 6 18"></path></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14"></path><path d="M16 5v14"></path></svg>',
    upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4"></path><path d="m7 9 5-5 5 5"></path><path d="M5 20h14"></path></svg>',
    chevronRight: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg>',
    chevronDown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>',
  };
  return icons[name] || "";
}

function setIconButton(button, iconName, label) {
  button.classList.add("icon-button");
  button.innerHTML = icon(iconName);
  button.title = label;
  button.setAttribute("aria-label", label);
}

function hydrateStaticIcons() {
  setIconButton(els.recordButton, "mic", "Record");
  setIconButton(els.stopButton, "stop", "Stop");
  setIconButton(els.clearAudioButton, "clear", "Clear");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : {"Content-Type": "application/json"}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function dateLabel(value) {
  if (!value) return "No date";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${month}/${day}/${year}` : value;
}

function eventIds(person) {
  return new Set((person.events || []).map((event) => event.id));
}

function eventById(eventId) {
  return state.events.find((event) => event.id === eventId);
}

function eventColor(event) {
  return /^#[0-9a-fA-F]{6}$/.test(event?.color || "") ? event.color : "#47c2b1";
}

function selectedEvents(selectedIds) {
  return state.events.filter((event) => selectedIds.has(event.id));
}

function personById(personId) {
  return state.people.find((person) => person.id === personId);
}

function peopleForEvent(eventId) {
  return state.people
    .filter((person) => eventIds(person).has(eventId))
    .sort((a, b) => a.name.localeCompare(b.name) || b.met_date.localeCompare(a.met_date));
}

function socialIconLinks(person) {
  const links = [
    person.email ? {href: `mailto:${person.email}`, iconName: "mail", label: "Email"} : null,
    person.linkedin ? {href: person.linkedin, iconName: "linkedin", label: "LinkedIn"} : null,
    person.instagram ? {href: person.instagram, iconName: "instagram", label: "Instagram"} : null,
    person.phone ? {href: `tel:${person.phone}`, iconName: "phone", label: "Phone"} : null,
  ].filter(Boolean);
  if (!links.length) return "";
  return `
    <div class="social-icons">
      ${links.map((link) => `
        <a class="social-icon-link" href="${escapeHtml(link.href)}" title="${escapeHtml(link.label)}" aria-label="${escapeHtml(link.label)}" ${link.href.startsWith("mailto:") ? "" : 'target="_blank" rel="noopener noreferrer"'}>
          ${icon(link.iconName)}
        </a>
      `).join("")}
    </div>
  `;
}

function rowPersonId(target) {
  return target.closest("tr")?.dataset.id || "";
}

function sortedPeople() {
  const rows = [...state.people];
  const eventPositions = new Map(state.events.map((event, index) => [event.id, index]));
  const firstEventPosition = (person) => {
    const positions = (person.events || [])
      .map((event) => eventPositions.get(event.id))
      .filter((position) => Number.isInteger(position));
    return positions.length ? Math.min(...positions) : Number.MAX_SAFE_INTEGER;
  };
  rows.sort((a, b) => {
    if (state.sort === "name") {
      return a.name.localeCompare(b.name);
    }
    if (state.sort === "event") {
      const eventCompare = firstEventPosition(a) - firstEventPosition(b);
      return eventCompare || b.met_date.localeCompare(a.met_date) || a.name.localeCompare(b.name);
    }
    return b.met_date.localeCompare(a.met_date) || a.name.localeCompare(b.name);
  });
  return rows;
}

function descriptionWithTranscript(description, transcript) {
  const separator = description.trim() ? "\n\n" : "";
  return `${description}${separator}${transcript}`;
}

function updateFormTranscriptAppendButton() {
  if (!els.appendFormTranscriptButton) return;
  const alreadyAppended = state.formTranscript && els.description.value.includes(state.formTranscript);
  els.appendFormTranscriptButton.hidden = !state.formTranscript || alreadyAppended;
}

function setFormTranscript(transcript) {
  state.formTranscript = transcript || "";
  if (els.formTranscriptBox) {
    els.formTranscriptBox.textContent = state.formTranscript;
    els.formTranscriptBox.hidden = !state.formTranscript;
  }
  updateFormTranscriptAppendButton();
}

function selectedEventLabel(selectedIds) {
  if (!state.events.length) return "No events";
  if (!selectedIds.size) return "Select events";
  const names = selectedEvents(selectedIds).map((event) => event.name);
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

function renderEventTags(selectedIds) {
  const events = selectedEvents(selectedIds);
  if (!events.length) return "";
  return `
    <div class="selected-event-tags">
      ${events.map((event) => `
        <span class="event-tag" style="--event-color: ${escapeHtml(eventColor(event))}">
          ${escapeHtml(event.name)}
        </span>
      `).join("")}
    </div>
  `;
}

function renderMultiSelect({id, selectedIds = new Set(), personId = "", context = "form"}) {
  const menuId = `${id}-menu`;
  const disabled = state.events.length ? "" : "disabled";
  return `
    <div class="multi-select-inner" data-person-id="${escapeHtml(personId)}" data-context="${escapeHtml(context)}">
      <button type="button" class="multi-select-toggle" data-action="toggle-events" aria-expanded="false" aria-controls="${escapeHtml(menuId)}" ${disabled}>
        <span>${escapeHtml(selectedEventLabel(selectedIds))}</span>
        <span aria-hidden="true">v</span>
      </button>
      <div id="${escapeHtml(menuId)}" class="multi-select-menu" hidden>
        ${state.events.length ? state.events.map((event) => `
          <label class="multi-select-option">
            <input type="checkbox" data-event-choice value="${escapeHtml(event.id)}" ${selectedIds.has(event.id) ? "checked" : ""}>
            <span class="event-swatch" style="--event-color: ${escapeHtml(eventColor(event))}"></span>
            <span>${escapeHtml(event.name)}</span>
            <small>${escapeHtml(dateLabel(event.event_date))}</small>
          </label>
        `).join("") : '<div class="multi-select-empty">No events</div>'}
      </div>
      <div class="selected-event-tags-wrap">${renderEventTags(selectedIds)}</div>
    </div>
  `;
}

function renderFormEventPicker(selectedIds = new Set(selectedFormEvents())) {
  els.eventPicker.innerHTML = renderMultiSelect({
    id: "person-event-picker",
    selectedIds,
    context: "form",
  });
}

function renderEventBoard() {
  if (!state.events.length) {
    els.eventBoard.innerHTML = '<div class="empty-panel">No events yet</div>';
    return;
  }
  els.eventBoard.innerHTML = state.events.slice(0, 3).map((event) => {
    const people = state.people.filter((person) => eventIds(person).has(event.id));
    return `
      <article class="event-card" data-event-id="${escapeHtml(event.id)}" role="button" tabindex="0" aria-label="${escapeHtml(event.name)} people" style="--event-color: ${escapeHtml(eventColor(event))}">
        <div class="event-card-head">
          <div>
            <h3>${escapeHtml(event.name)}</h3>
            <span>${escapeHtml(dateLabel(event.event_date))}</span>
          </div>
          <span>${people.length}</span>
        </div>
        <div class="event-person-list">
          ${people.length ? people.slice(0, 6).map((person) => `
            <div class="event-person">
              <strong>${escapeHtml(person.name)}</strong>
              <span>${escapeHtml(person.description || person.email || "")}</span>
            </div>
          `).join("") : '<div class="muted">No people tagged</div>'}
          ${people.length > 6 ? `<div class="muted">${people.length - 6} more</div>` : ""}
        </div>
      </article>
    `;
  }).join("");
}

function renderEventPeopleDialog() {
  const event = eventById(state.eventPeopleEventId);
  if (!event) return;
  const people = peopleForEvent(event.id);
  els.eventPeopleTitle.textContent = event.name;
  els.eventPeopleMeta.textContent = `${dateLabel(event.event_date)} - ${people.length} ${people.length === 1 ? "person" : "people"}`;
  if (!people.length) {
    els.eventPeopleList.innerHTML = '<div class="empty-panel">No people tagged</div>';
    return;
  }
  els.eventPeopleList.innerHTML = people.map((person) => {
    const expanded = state.eventPeopleExpandedIds.has(person.id);
    const message = state.eventPeopleMessages[person.id] || "";
    const generating = state.eventPeopleGeneratingId === person.id;
    const name = person.linkedin
      ? `<a class="event-person-name" href="${escapeHtml(person.linkedin)}" target="_blank" rel="noopener noreferrer">${escapeHtml(person.name)}</a>`
      : `<span class="event-person-name">${escapeHtml(person.name)}</span>`;
    return `
      <div class="event-people-row ${expanded ? "expanded" : "collapsed"}" data-person-id="${escapeHtml(person.id)}">
        <div class="event-people-row-main">
          <button type="button" class="row-toggle secondary-button" data-action="toggle-event-person" aria-label="${expanded ? "Collapse person" : "Expand person"}">
            ${expanded ? icon("chevronDown") : icon("chevronRight")}
          </button>
          ${name}
        </div>
        ${expanded ? `
          <div class="event-person-expanded">
            <div class="event-person-description">${escapeHtml(person.description || "No description")}</div>
            <div class="linkedin-message-actions">
              <button type="button" class="small-button secondary-button" data-action="generate-linkedin-message" data-person-id="${escapeHtml(person.id)}" ${generating ? "disabled" : ""}>
                ${generating ? "Generating" : message ? "Regenerate LinkedIn message" : "Generate LinkedIn message"}
              </button>
              ${message ? `<button type="button" class="small-button secondary-button" data-action="copy-linkedin-message" data-person-id="${escapeHtml(person.id)}">Copy</button>` : ""}
            </div>
            ${message ? `<div class="linkedin-message-box">${escapeHtml(message)}</div>` : ""}
          </div>
        ` : ""}
      </div>
    `;
  }).join("");
}

function renderEventsDialog() {
  if (!state.events.length) {
    els.eventOrderList.innerHTML = '<div class="empty-panel">No events</div>';
    return;
  }
  els.eventOrderList.innerHTML = state.events.map((event) => `
    <div class="event-order-row" draggable="true" data-event-id="${escapeHtml(event.id)}" style="--event-color: ${escapeHtml(eventColor(event))}">
      <button type="button" class="drag-handle secondary-button" data-action="drag-handle" aria-label="Drag event">=</button>
      <input data-event-field="name" value="${escapeHtml(event.name)}" aria-label="Event name">
      <input data-event-field="event_date" type="date" value="${escapeHtml(event.event_date)}" aria-label="Event date">
      <input class="event-color-input" data-event-field="color" type="color" value="${escapeHtml(eventColor(event))}" aria-label="Event color">
      <span class="event-count">${Number(event.people_count || 0)} people</span>
      <button type="button" class="small-button danger-button" data-action="delete-event">Delete</button>
    </div>
  `).join("");
}

function renderPeople() {
  const rows = sortedPeople();
  if (!rows.length) {
    els.peopleBody.innerHTML = '<tr><td class="empty-row" colspan="7">No people saved</td></tr>';
    return;
  }
  els.peopleBody.innerHTML = rows.map((person) => {
    const selectedIds = eventIds(person);
    const expanded = state.expandedPeople.has(person.id);
    const transcript = person.transcript || "";
    const transcriptInDescription = transcript && person.description.includes(transcript);
    const nameDisplay = person.linkedin
      ? `<a class="person-name-link" href="${escapeHtml(person.linkedin)}" target="_blank" rel="noopener noreferrer">${escapeHtml(person.name)}</a>`
      : `<span class="person-name-text">${escapeHtml(person.name)}</span>`;

    return `
      <tr data-id="${escapeHtml(person.id)}" class="${expanded ? "expanded" : "collapsed"}">
        <td class="collapse-cell">
          <button type="button" class="row-toggle secondary-button" data-action="toggle-collapse" aria-label="${expanded ? "Collapse row" : "Expand row"}">
            ${expanded ? icon("chevronDown") : icon("chevronRight")}
          </button>
        </td>
        <td class="name-cell">
          <div class="person-name-display ${person.linkedin ? "" : "no-link"}">${nameDisplay}</div>
          <input class="inline-input person-name-edit" data-field="name" value="${escapeHtml(person.name)}">
          <div class="name-events">
            ${renderMultiSelect({
              id: `events-${person.id}`,
              selectedIds,
              personId: person.id,
              context: "table",
            })}
          </div>
        </td>
        <td class="date-cell">
          <input class="inline-input" data-field="met_date" type="date" value="${escapeHtml(person.met_date)}">
        </td>
        <td class="description-cell">
          <textarea class="inline-textarea" data-field="description">${escapeHtml(person.description)}</textarea>
          ${transcript ? `<div class="transcript-box">${escapeHtml(transcript)}</div>` : ""}
          ${transcript && !transcriptInDescription ? `<button type="button" class="small-button secondary-button" data-action="append-transcript">Append transcript</button>` : ""}
        </td>
        <td class="audio-cell">
          <div class="cell-actions">
            ${person.audio_url ? `
              <button type="button" class="small-button secondary-button icon-button" data-action="play-audio" title="Play" aria-label="Play">${icon("play")}</button>
              <button type="button" class="small-button secondary-button" data-action="transcribe">Transcribe</button>
            ` : '<span class="muted">No audio</span>'}
            <button type="button" class="small-button secondary-button icon-button" data-action="record-table-audio" title="Record" aria-label="Record">${icon("mic")}</button>
            <button type="button" class="small-button secondary-button icon-button" data-action="stop-table-audio" title="Stop" aria-label="Stop" disabled>${icon("stop")}</button>
            <button type="button" class="small-button secondary-button icon-button" data-action="upload-audio" title="Upload" aria-label="Upload">${icon("upload")}</button>
            <input data-audio-input type="file" accept="audio/*" hidden>
          </div>
          ${person.audio_url ? `<audio src="${escapeHtml(person.audio_url)}" preload="none"></audio>` : ""}
        </td>
        <td class="social-cell">
          <div class="social-stack">
            <input data-field="email" type="email" placeholder="Email" value="${escapeHtml(person.email)}">
            <input data-field="linkedin" type="text" placeholder="LinkedIn" value="${escapeHtml(person.linkedin)}">
            <input data-field="instagram" type="text" placeholder="Instagram" value="${escapeHtml(person.instagram)}">
            <input data-field="discord" type="text" placeholder="Discord" value="${escapeHtml(person.discord || "")}">
            <input data-field="phone" type="tel" placeholder="Phone number" value="${escapeHtml(person.phone || "")}">
            <div class="cell-actions">
              <button type="button" class="small-button secondary-button" data-action="apollo">Apollo</button>
              ${socialIconLinks(person)}
            </div>
          </div>
        </td>
        <td class="action-cell">
          <button type="button" class="small-button danger-button" data-action="delete">Delete</button>
        </td>
      </tr>
    `;
  }).join("");
}

function renderAll() {
  state.events.sort((a, b) => Number(a.position || 0) - Number(b.position || 0) || b.event_date.localeCompare(a.event_date) || a.name.localeCompare(b.name));
  renderFormEventPicker();
  renderEventBoard();
  renderPeople();
  if (els.eventsDialog.open) renderEventsDialog();
  if (els.eventPeopleDialog.open) renderEventPeopleDialog();
}

async function loadAll() {
  const [eventsData, peopleData] = await Promise.all([
    api("/api/events"),
    api("/api/people"),
  ]);
  state.events = eventsData.events || [];
  state.people = peopleData.people || [];
  renderAll();
}

function upsertPerson(person) {
  const index = state.people.findIndex((row) => row.id === person.id);
  if (index >= 0) {
    state.people[index] = person;
  } else {
    state.people.unshift(person);
  }
  renderAll();
}

async function updatePerson(personId, payload) {
  const data = await api(`/api/people/${encodeURIComponent(personId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  upsertPerson(data.person);
  return data.person;
}

function selectedFormEvents() {
  return [...els.eventPicker.querySelectorAll("input[data-event-choice]:checked")].map((input) => input.value);
}

function selectedPickerEvents(picker) {
  return [...picker.querySelectorAll("input[data-event-choice]:checked")].map((input) => input.value);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function getMicrophoneStream() {
  if (!window.isSecureContext) {
    throw new Error("Microphone recording requires HTTPS, or localhost/127.0.0.1 on the same machine.");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone recording is not available in this browser.");
  }
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Audio recording is not supported in this browser.");
  }
  return navigator.mediaDevices.getUserMedia({audio: true});
}

async function attachAudioBlob(personId, blob) {
  const person = personById(personId);
  if (!person) return;
  const dataUrl = await blobToDataUrl(blob);
  await updatePerson(personId, {
    audio: {
      data_url: dataUrl,
      mime_type: blob.type || "audio/webm",
    },
  });
}

function clearRecordedAudio() {
  if (state.recording.url) {
    URL.revokeObjectURL(state.recording.url);
  }
  state.recording.blob = null;
  state.recording.url = "";
  state.recording.chunks = [];
  els.audioPreview.hidden = true;
  els.audioPreview.removeAttribute("src");
  els.clearAudioButton.disabled = true;
  els.formTranscribeButton.disabled = true;
  els.recordingState.textContent = "No audio";
  els.recordingState.className = "recording-state";
  setFormTranscript("");
}

async function startRecording() {
  try {
    const stream = await getMicrophoneStream();
    clearRecordedAudio();
    const recorder = new MediaRecorder(stream);
    state.recording.mediaRecorder = recorder;
    state.recording.chunks = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) state.recording.chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(state.recording.chunks, {type: recorder.mimeType || "audio/webm"});
      state.recording.blob = blob;
      state.recording.url = URL.createObjectURL(blob);
      els.audioPreview.src = state.recording.url;
      els.audioPreview.hidden = false;
      els.clearAudioButton.disabled = false;
      els.formTranscribeButton.disabled = false;
      els.recordingState.textContent = "Audio ready";
      els.recordingState.className = "recording-state";
    });
    recorder.start();
    els.recordButton.disabled = true;
    els.stopButton.disabled = false;
    els.recordingState.textContent = "Recording";
    els.recordingState.className = "recording-state live";
  } catch (error) {
    setStatus(error.message, true);
  }
}

function stopRecording() {
  if (state.recording.mediaRecorder && state.recording.mediaRecorder.state !== "inactive") {
    state.recording.mediaRecorder.stop();
  }
  els.recordButton.disabled = false;
  els.stopButton.disabled = true;
}

async function startTableRecording(personId, row) {
  if (state.tableRecording.mediaRecorder && state.tableRecording.mediaRecorder.state !== "inactive") {
    state.tableRecording.mediaRecorder.stop();
  }
  const recordButton = row.querySelector('[data-action="record-table-audio"]');
  const stopButton = row.querySelector('[data-action="stop-table-audio"]');
  try {
    const stream = await getMicrophoneStream();
    const recorder = new MediaRecorder(stream);
    state.tableRecording = {personId, mediaRecorder: recorder, chunks: []};
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) state.tableRecording.chunks.push(event.data);
    });
    recorder.addEventListener("stop", async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(state.tableRecording.chunks, {type: recorder.mimeType || "audio/webm"});
      try {
        await attachAudioBlob(personId, blob);
        setStatus("Audio saved.");
      } catch (error) {
        setStatus(error.message, true);
      } finally {
        state.tableRecording = {personId: "", mediaRecorder: null, chunks: []};
      }
    });
    recorder.start();
    recordButton.disabled = true;
    stopButton.disabled = false;
    setStatus("Recording table audio...");
  } catch (error) {
    recordButton.disabled = false;
    stopButton.disabled = true;
    setStatus(error.message, true);
  }
}

function stopTableRecording(personId) {
  const recorder = state.tableRecording.mediaRecorder;
  if (state.tableRecording.personId === personId && recorder && recorder.state !== "inactive") {
    recorder.stop();
  }
}

function resetPersonForm() {
  const metDate = els.metDate.value;
  const selectedIds = new Set(selectedFormEvents());
  els.personForm.reset();
  els.metDate.value = metDate || today();
  renderFormEventPicker(selectedIds);
  clearRecordedAudio();
}

async function createPersonFromForm() {
  const form = new FormData(els.personForm);
  const payload = {
    name: form.get("name"),
    met_date: form.get("met_date"),
    description: form.get("description"),
    email: form.get("email"),
    linkedin: form.get("linkedin"),
    instagram: form.get("instagram"),
    discord: form.get("discord"),
    phone: form.get("phone"),
    event_ids: selectedFormEvents(),
  };
  if (state.formTranscript) {
    payload.transcript = state.formTranscript;
  }
  if (state.recording.blob) {
    payload.audio = {
      data_url: await blobToDataUrl(state.recording.blob),
      mime_type: state.recording.blob.type || "audio/webm",
    };
  }
  const data = await api("/api/people", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  state.people.unshift(data.person);
  return data.person;
}

async function createPerson(event) {
  event.preventDefault();
  try {
    await createPersonFromForm();
    resetPersonForm();
    renderAll();
    setStatus("Saved.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function transcribeFormPerson() {
  if (!state.recording.blob) {
    setStatus("Record audio before transcribing.", true);
    return;
  }

  const button = els.formTranscribeButton;
  button.disabled = true;
  button.textContent = "Transcribing";
  try {
    const dataUrl = await blobToDataUrl(state.recording.blob);
    const data = await api("/api/transcribe", {
      method: "POST",
      body: JSON.stringify({
        audio: {
          data_url: dataUrl,
          mime_type: state.recording.blob.type || "audio/webm",
        },
      }),
    });
    setFormTranscript(data.transcript);
    setStatus("Transcript generated.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    button.textContent = "Transcribe";
    button.disabled = !state.recording.blob;
  }
}

async function createEvent(event) {
  event.preventDefault();
  try {
    const data = await api("/api/events", {
      method: "POST",
      body: JSON.stringify({name: els.eventName.value, event_date: els.eventDate.value}),
    });
    state.events.push(data.event);
    els.eventForm.reset();
    els.eventDate.value = today();
    renderAll();
    setStatus("Event added.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function updateEvent(eventId, payload) {
  const data = await api(`/api/events/${encodeURIComponent(eventId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  const index = state.events.findIndex((event) => event.id === eventId);
  if (index >= 0) state.events[index] = data.event;
  renderAll();
}

async function reorderEventsFromDom() {
  const eventIds = [...els.eventOrderList.querySelectorAll(".event-order-row")].map((row) => row.dataset.eventId);
  const data = await api("/api/events/order", {
    method: "PUT",
    body: JSON.stringify({event_ids: eventIds}),
  });
  state.events = data.events || [];
  renderAll();
  setStatus("Event order updated.");
}

async function handleTableChange(event) {
  const target = event.target;
  if (target.matches("input[data-audio-input]")) {
    const file = target.files && target.files[0];
    const personId = rowPersonId(target);
    if (!file || !personId) return;
    try {
      await attachAudioBlob(personId, file);
      setStatus("Audio uploaded.");
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      target.value = "";
    }
    return;
  }

  if (target.matches("input[data-event-choice]")) {
    const picker = target.closest(".multi-select-inner");
    if (!picker) return;
    if (picker.dataset.context === "table") {
      try {
        await updatePerson(picker.dataset.personId, {event_ids: selectedPickerEvents(picker)});
        setStatus("Events updated.");
      } catch (error) {
        setStatus(error.message, true);
      }
    } else {
      updatePickerButton(picker);
    }
    return;
  }

  const field = target.dataset.field;
  if (!field) return;
  const personId = rowPersonId(target);
  if (!personId) return;
  try {
    await updatePerson(personId, {[field]: target.value});
    setStatus("Updated.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function handleTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "toggle-events") return;

  const personId = rowPersonId(button);
  const person = personById(personId);
  if (!person) return;

  if (action === "toggle-collapse") {
    if (state.expandedPeople.has(personId)) {
      state.expandedPeople.delete(personId);
    } else {
      state.expandedPeople.add(personId);
    }
    renderPeople();
    return;
  }

  if (action === "play-audio") {
    const audio = button.closest("td").querySelector("audio");
    if (audio.paused) {
      audio.play();
      setIconButton(button, "pause", "Pause");
    } else {
      audio.pause();
      setIconButton(button, "play", "Play");
    }
    audio.onended = () => {
      setIconButton(button, "play", "Play");
    };
    return;
  }

  if (action === "upload-audio") {
    button.closest("td").querySelector("input[data-audio-input]").click();
    return;
  }

  if (action === "record-table-audio") {
    await startTableRecording(personId, button.closest("tr"));
    return;
  }

  if (action === "stop-table-audio") {
    stopTableRecording(personId);
    return;
  }

  if (action === "transcribe") {
    state.expandedPeople.add(personId);
    button.disabled = true;
    button.textContent = "Transcribing";
    try {
      const data = await api(`/api/people/${encodeURIComponent(personId)}/transcribe`, {method: "POST"});
      await updatePerson(personId, {transcript: data.transcript});
      setStatus("Transcript generated.");
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "Transcribe";
    }
    return;
  }

  if (action === "append-transcript") {
    await updatePerson(personId, {description: descriptionWithTranscript(person.description, person.transcript)});
    setStatus("Transcript appended.");
    return;
  }

  if (action === "apollo") {
    openApollo(personId);
    return;
  }

  if (action === "delete") {
    const ok = window.confirm(`Delete ${person.name}?`);
    if (!ok) return;
    try {
      await api(`/api/people/${encodeURIComponent(personId)}`, {method: "DELETE"});
      state.people = state.people.filter((row) => row.id !== personId);
      state.expandedPeople.delete(personId);
      renderAll();
      setStatus("Deleted.");
    } catch (error) {
      setStatus(error.message, true);
    }
  }
}

function closeEventMenus(except = null) {
  document.querySelectorAll(".multi-select-menu").forEach((menu) => {
    if (menu === except) return;
    menu.hidden = true;
    const button = menu.closest(".multi-select-inner")?.querySelector(".multi-select-toggle");
    if (button) button.setAttribute("aria-expanded", "false");
  });
}

function updatePickerButton(picker) {
  const ids = new Set(selectedPickerEvents(picker));
  const label = picker.querySelector(".multi-select-toggle span:first-child");
  if (label) label.textContent = selectedEventLabel(ids);
  const tags = picker.querySelector(".selected-event-tags-wrap");
  if (tags) tags.innerHTML = renderEventTags(ids);
}

function handleDocumentClick(event) {
  const toggle = event.target.closest('button[data-action="toggle-events"]');
  if (toggle) {
    const picker = toggle.closest(".multi-select-inner");
    const menu = picker.querySelector(".multi-select-menu");
    const shouldOpen = menu.hidden;
    closeEventMenus(menu);
    menu.hidden = !shouldOpen;
    toggle.setAttribute("aria-expanded", String(shouldOpen));
    return;
  }
  if (!event.target.closest(".multi-select-inner")) {
    closeEventMenus();
  }
}

async function handleFormEventChange(event) {
  if (!event.target.matches("input[data-event-choice]")) return;
  const picker = event.target.closest(".multi-select-inner");
  updatePickerButton(picker);
}

function openEventsDialog() {
  renderEventsDialog();
  if (!els.eventsDialog.open) els.eventsDialog.showModal();
}

function openEventPeopleDialog(eventId) {
  state.eventPeopleEventId = eventId;
  state.eventPeopleExpandedIds.clear();
  state.eventPeopleMessages = {};
  state.eventPeopleGeneratingId = "";
  renderEventPeopleDialog();
  if (!els.eventPeopleDialog.open) els.eventPeopleDialog.showModal();
}

function closeEventPeopleDialog() {
  els.eventPeopleDialog.close();
  state.eventPeopleEventId = "";
  state.eventPeopleExpandedIds.clear();
  state.eventPeopleMessages = {};
  state.eventPeopleGeneratingId = "";
}

function toggleEventPeopleRow(personId) {
  if (state.eventPeopleExpandedIds.has(personId)) {
    state.eventPeopleExpandedIds.delete(personId);
  } else {
    state.eventPeopleExpandedIds.add(personId);
  }
  renderEventPeopleDialog();
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

async function generateLinkedInMessage(personId) {
  state.eventPeopleGeneratingId = personId;
  renderEventPeopleDialog();
  try {
    const data = await api("/api/linkedin-message", {
      method: "POST",
      body: JSON.stringify({
        person_id: personId,
        event_id: state.eventPeopleEventId,
      }),
    });
    state.eventPeopleMessages = {
      ...state.eventPeopleMessages,
      [personId]: data.message || "",
    };
    setStatus("LinkedIn message generated.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    state.eventPeopleGeneratingId = "";
    renderEventPeopleDialog();
  }
}

function handleEventBoardClick(event) {
  const card = event.target.closest(".event-card[data-event-id]");
  if (!card) return;
  openEventPeopleDialog(card.dataset.eventId);
}

function handleEventBoardKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest(".event-card[data-event-id]");
  if (!card) return;
  event.preventDefault();
  openEventPeopleDialog(card.dataset.eventId);
}

async function handleEventPeopleClick(event) {
  const actionButton = event.target.closest("button[data-action]");
  if (actionButton?.dataset.action === "generate-linkedin-message") {
    await generateLinkedInMessage(actionButton.dataset.personId);
    return;
  }
  if (actionButton?.dataset.action === "copy-linkedin-message") {
    const message = state.eventPeopleMessages[actionButton.dataset.personId] || "";
    if (!message) return;
    try {
      await copyText(message);
      setStatus("LinkedIn message copied.");
    } catch (error) {
      setStatus(error.message, true);
    }
    return;
  }
  if (event.target.closest("a")) return;
  const row = event.target.closest(".event-people-row-main")?.closest(".event-people-row");
  if (!row) return;
  toggleEventPeopleRow(row.dataset.personId);
}

async function handleEventsDialogChange(event) {
  const target = event.target;
  const field = target.dataset.eventField;
  if (!field) return;
  const row = target.closest(".event-order-row");
  try {
    await updateEvent(row.dataset.eventId, {[field]: target.value});
    setStatus("Event updated.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function handleEventsDialogClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button || button.dataset.action !== "delete-event") return;
  const row = button.closest(".event-order-row");
  const eventData = eventById(row.dataset.eventId);
  const ok = window.confirm(`Delete ${eventData?.name || "event"}?`);
  if (!ok) return;
  try {
    await api(`/api/events/${encodeURIComponent(row.dataset.eventId)}`, {method: "DELETE"});
    state.events = state.events.filter((event) => event.id !== row.dataset.eventId);
    state.people = state.people.map((person) => ({
      ...person,
      events: person.events.filter((event) => event.id !== row.dataset.eventId),
    }));
    renderAll();
    setStatus("Event deleted.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

function handleEventDragStart(event) {
  const row = event.target.closest(".event-order-row");
  if (!row) return;
  state.dragEventId = row.dataset.eventId;
  state.orderDirty = false;
  row.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", state.dragEventId);
}

function handleEventDragOver(event) {
  const row = event.target.closest(".event-order-row");
  if (!row || !state.dragEventId || row.dataset.eventId === state.dragEventId) return;
  event.preventDefault();
  const dragging = [...els.eventOrderList.querySelectorAll(".event-order-row")]
    .find((item) => item.dataset.eventId === state.dragEventId);
  if (!dragging) return;
  const rect = row.getBoundingClientRect();
  const before = event.clientY < rect.top + rect.height / 2;
  els.eventOrderList.insertBefore(dragging, before ? row : row.nextSibling);
  state.orderDirty = true;
}

async function handleEventDrop(event) {
  if (!state.dragEventId) return;
  event.preventDefault();
  try {
    await reorderEventsFromDom();
    state.orderDirty = false;
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function handleEventDragEnd() {
  els.eventOrderList.querySelectorAll(".dragging").forEach((row) => row.classList.remove("dragging"));
  if (state.dragEventId && state.orderDirty) {
    try {
      await reorderEventsFromDom();
    } catch (error) {
      setStatus(error.message, true);
    }
  }
  state.dragEventId = "";
  state.orderDirty = false;
}

async function openApollo(personId) {
  const person = personById(personId);
  if (!person) return;
  state.apolloPersonId = personId;
  els.apolloResults.innerHTML = "";
  setApolloStatus("Searching...");
  if (!els.apolloDialog.open) {
    els.apolloDialog.showModal();
  }
  try {
    const data = await api("/api/apollo/search", {
      method: "POST",
      body: JSON.stringify({name: person.name}),
    });
    renderApolloCandidates(data.candidates || []);
    setApolloStatus(data.candidates?.length ? `${data.candidates.length} candidates` : "No candidates");
  } catch (error) {
    setApolloStatus(error.message, true);
  }
}

function renderApolloCandidates(candidates) {
  if (!candidates.length) {
    els.apolloResults.innerHTML = '<div class="muted">No candidates</div>';
    return;
  }
  els.apolloResults.innerHTML = candidates.map((candidate, index) => `
    <div class="candidate">
      <div>
        <strong>${escapeHtml(candidate.name || "Unknown")}</strong>
        <span>${escapeHtml([candidate.title, candidate.organization_name].filter(Boolean).join(" at "))}</span>
        <span>${escapeHtml(candidate.location || "")}</span>
        <span>${candidate.has_email ? "Verified email available" : "Email availability unknown"}</span>
      </div>
      <button type="button" data-candidate-index="${index}">Enrich</button>
    </div>
  `).join("");
  els.apolloResults.querySelectorAll("button[data-candidate-index]").forEach((button) => {
    button.addEventListener("click", () => enrichCandidate(candidates[Number(button.dataset.candidateIndex)], button));
  });
}

async function enrichCandidate(candidate, button) {
  const person = personById(state.apolloPersonId);
  if (!person) return;
  button.disabled = true;
  button.textContent = "Enriching";
  try {
    const data = await api("/api/apollo/enrich", {
      method: "POST",
      body: JSON.stringify({candidate}),
    });
    const payload = {
      email: data.email || person.email,
      linkedin: data.linkedin || person.linkedin || candidate.linkedin,
    };
    await updatePerson(person.id, payload);
    setApolloStatus("Applied.");
  } catch (error) {
    setApolloStatus(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Enrich";
  }
}

document.querySelectorAll(".sort-button").forEach((button) => {
  button.addEventListener("click", () => {
    state.sort = button.dataset.sort;
    document.querySelectorAll(".sort-button").forEach((item) => item.classList.toggle("active", item === button));
    renderPeople();
  });
});

els.eventForm.addEventListener("submit", createEvent);
els.personForm.addEventListener("submit", createPerson);
els.peopleBody.addEventListener("change", handleTableChange);
els.peopleBody.addEventListener("click", handleTableClick);
els.eventPicker.addEventListener("change", handleFormEventChange);
els.eventBoard.addEventListener("click", handleEventBoardClick);
els.eventBoard.addEventListener("keydown", handleEventBoardKeydown);
els.recordButton.addEventListener("click", startRecording);
els.stopButton.addEventListener("click", stopRecording);
els.clearAudioButton.addEventListener("click", clearRecordedAudio);
els.formTranscribeButton.addEventListener("click", transcribeFormPerson);
els.appendFormTranscriptButton.addEventListener("click", () => {
  if (!state.formTranscript) return;
  els.description.value = descriptionWithTranscript(els.description.value, state.formTranscript);
  updateFormTranscriptAppendButton();
  setStatus("Transcript appended.");
});
els.description.addEventListener("input", updateFormTranscriptAppendButton);
els.apolloClose.addEventListener("click", () => els.apolloDialog.close());
els.eventsOpenSecondary.addEventListener("click", openEventsDialog);
els.eventsClose.addEventListener("click", () => els.eventsDialog.close());
els.eventPeopleClose.addEventListener("click", closeEventPeopleDialog);
els.eventPeopleDialog.addEventListener("close", () => {
  state.eventPeopleEventId = "";
  state.eventPeopleExpandedIds.clear();
  state.eventPeopleMessages = {};
  state.eventPeopleGeneratingId = "";
});
els.eventPeopleList.addEventListener("click", handleEventPeopleClick);
els.eventOrderList.addEventListener("change", handleEventsDialogChange);
els.eventOrderList.addEventListener("click", handleEventsDialogClick);
els.eventOrderList.addEventListener("dragstart", handleEventDragStart);
els.eventOrderList.addEventListener("dragover", handleEventDragOver);
els.eventOrderList.addEventListener("drop", handleEventDrop);
els.eventOrderList.addEventListener("dragend", handleEventDragEnd);
document.addEventListener("click", handleDocumentClick);

els.metDate.value = today();
els.eventDate.value = today();
hydrateStaticIcons();
loadAll().catch((error) => setStatus(error.message, true));
