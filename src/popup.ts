import {
  addCardToPool,
  appendSequenceCard,
  applyFirstThenPreset,
  completeNowCard,
  deletePoolCard,
  removeSequenceCard,
  replaceSequenceCard,
  selectNextCard,
  selectNowCard,
  type Card,
  type CardInput,
  type PopupState,
  updatePoolCard,
} from "./core/cards";
import { setParentPin, switchToChildMode, switchToParentMode } from "./core/mode";
import { getPremiumAccess, startPremiumTrial, stripeCheckoutUrl } from "./core/premium";
import { firstThenPresets, presetCards } from "./core/presets";
import { loadPopupState, savePopupState } from "./core/state";
import { store } from "./storage";

const app = document.querySelector<HTMLDivElement>("#app");
let currentState: PopupState | null = null;

function t(messageName: string): string {
  const message = chrome.i18n.getMessage(messageName);
  return message || messageName;
}

function localizedPresetLabel(presetId: string, fallback: string): string {
  const message = chrome.i18n.getMessage(`preset_${presetId.replace(/-/g, "_")}`);
  return message || fallback;
}

function localizedCardLabel(card: Card): string {
  const presetCard = presetCards.find((item) => item.id === card.id);

  if (!presetCard || presetCard.label !== card.label) {
    return card.label;
  }

  const message = chrome.i18n.getMessage(`card_${card.id.replace(/-/g, "_")}`);
  return message || card.label;
}

function cardAccessibleName(card: Card): string {
  return `${card.emoji} ${localizedCardLabel(card)}`;
}

function interpolate(messageName: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.split(`$${key}$`).join(value),
    t(messageName),
  );
}

function createCardId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `card-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function renderBigCard(title: string, card: Card): HTMLElement {
  const section = document.createElement("section");
  section.className = "stage-card";
  section.setAttribute("aria-label", `${title}: ${cardAccessibleName(card)}`);

  const heading = document.createElement("h2");
  heading.textContent = title;

  const emoji = document.createElement("div");
  emoji.className = "stage-card__emoji";
  emoji.textContent = card.emoji;

  const label = document.createElement("div");
  label.className = "stage-card__label";
  label.textContent = localizedCardLabel(card);

  section.append(heading, emoji, label);
  return section;
}

function renderPoolCard(card: Card, state: PopupState): HTMLElement {
  const item = document.createElement("div");
  item.className = "pool-card";
  item.dataset.selectedNow = String(state.now.id === card.id);
  item.dataset.selectedNext = String(state.next.id === card.id);
  item.setAttribute("aria-label", cardAccessibleName(card));

  const emoji = document.createElement("span");
  emoji.className = "pool-card__emoji";
  emoji.textContent = card.emoji;

  const label = document.createElement("span");
  label.className = "pool-card__label";
  label.textContent = localizedCardLabel(card);

  const status = document.createElement("span");
  status.className = "pool-card__status";

  if (state.now.id === card.id && state.next.id === card.id) {
    status.textContent = `${t("selectedNow")} / ${t("selectedNext")}`;
  } else if (state.now.id === card.id) {
    status.textContent = t("selectedNow");
  } else if (state.next.id === card.id) {
    status.textContent = t("selectedNext");
  } else {
    status.classList.add("visually-hidden");
    status.textContent = t("notSelected");
  }

  const text = document.createElement("span");
  text.className = "pool-card__text";
  text.append(label, status);

  const actions = document.createElement("div");
  actions.className = "pool-card__actions";

  const nowButton = document.createElement("button");
  nowButton.className = "icon-button";
  nowButton.type = "button";
  nowButton.textContent = t("now");
  nowButton.dataset.action = "select-now";
  nowButton.dataset.cardId = card.id;
  nowButton.setAttribute("aria-pressed", String(state.now.id === card.id));
  nowButton.setAttribute(
    "aria-label",
    interpolate("selectNowAria", { card: cardAccessibleName(card) }),
  );

  const nextButton = document.createElement("button");
  nextButton.className = "icon-button";
  nextButton.type = "button";
  nextButton.textContent = t("next");
  nextButton.dataset.action = "select-next";
  nextButton.dataset.cardId = card.id;
  nextButton.setAttribute("aria-pressed", String(state.next.id === card.id));
  nextButton.setAttribute(
    "aria-label",
    interpolate("selectNextAria", { card: cardAccessibleName(card) }),
  );

  const editButton = document.createElement("button");
  editButton.className = "icon-button";
  editButton.type = "button";
  editButton.textContent = t("edit");
  editButton.dataset.action = "edit";
  editButton.dataset.cardId = card.id;
  editButton.setAttribute(
    "aria-label",
    interpolate("editCardAria", { card: cardAccessibleName(card) }),
  );

  const deleteButton = document.createElement("button");
  deleteButton.className = "icon-button";
  deleteButton.type = "button";
  deleteButton.textContent = t("delete");
  deleteButton.dataset.action = "delete";
  deleteButton.dataset.cardId = card.id;
  deleteButton.setAttribute(
    "aria-label",
    interpolate("deleteCardAria", { card: cardAccessibleName(card) }),
  );

  actions.append(nowButton, nextButton, editButton, deleteButton);
  item.append(emoji, text, actions);
  return item;
}

function renderCardForm(): HTMLFormElement {
  const form = document.createElement("form");
  form.className = "card-form";

  const emojiInput = document.createElement("input");
  emojiInput.name = "emoji";
  emojiInput.type = "text";
  emojiInput.placeholder = t("emoji");
  emojiInput.setAttribute("aria-label", t("emoji"));
  emojiInput.required = true;

  const labelInput = document.createElement("input");
  labelInput.name = "label";
  labelInput.type = "text";
  labelInput.placeholder = t("label");
  labelInput.setAttribute("aria-label", t("label"));
  labelInput.required = true;

  const addButton = document.createElement("button");
  addButton.type = "submit";
  addButton.textContent = t("add");

  form.append(emojiInput, labelInput, addButton);
  return form;
}

async function saveAndRender(state: PopupState): Promise<void> {
  currentState = state;
  await savePopupState(store, state);
  renderPopupState(state);
}

function readCardInput(form: HTMLFormElement): CardInput {
  const formData = new FormData(form);
  return {
    emoji: String(formData.get("emoji") ?? ""),
    label: String(formData.get("label") ?? ""),
  };
}

function findCard(state: PopupState, cardId: string): Card | null {
  return state.pool.find((card) => card.id === cardId) ?? null;
}

async function handleAddCard(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  if (!currentState || !(event.currentTarget instanceof HTMLFormElement)) {
    return;
  }

  const nextState = addCardToPool(currentState, readCardInput(event.currentTarget), createCardId());
  await saveAndRender(nextState);
}

async function handleCompleteNow(): Promise<void> {
  if (!currentState) {
    return;
  }

  await saveAndRender(completeNowCard(currentState));
}

async function handleEnterChildMode(): Promise<void> {
  if (!currentState) {
    return;
  }

  const pin = window.prompt(t("setParentPinPrompt"), currentState.parentPin ?? "");

  if (pin === null) {
    return;
  }

  await saveAndRender(switchToChildMode(currentState, pin));
}

async function handleEnterParentMode(): Promise<void> {
  if (!currentState) {
    return;
  }

  const pin = window.prompt(t("parentPinPrompt"));

  if (pin === null) {
    return;
  }

  const nextState = switchToParentMode(currentState, pin);

  if (nextState === currentState) {
    window.alert(t("pinMismatch"));
    return;
  }

  await saveAndRender(nextState);
}

async function handleChangePin(): Promise<void> {
  if (!currentState) {
    return;
  }

  const pin = window.prompt(t("newParentPinPrompt"), currentState.parentPin ?? "");

  if (pin === null) {
    return;
  }

  await saveAndRender(setParentPin(currentState, pin));
}

async function handleStartTrial(): Promise<void> {
  if (!currentState) {
    return;
  }

  await saveAndRender(startPremiumTrial(currentState));
}

function handleOpenCheckout(): void {
  window.open(stripeCheckoutUrl, "_blank", "noopener,noreferrer");
}

async function handleSequenceAction(event: Event): Promise<void> {
  const target = event.target;

  if (!currentState || !(target instanceof HTMLElement)) {
    return;
  }

  if (target instanceof HTMLSelectElement) {
    const index = Number(target.dataset.sequenceIndex);

    if (!Number.isInteger(index)) {
      return;
    }

    await saveAndRender(replaceSequenceCard(currentState, index, target.value));
    return;
  }

  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const action = target.dataset.action;

  if (action === "remove-sequence") {
    const index = Number(target.dataset.sequenceIndex);

    if (Number.isInteger(index)) {
      await saveAndRender(removeSequenceCard(currentState, index));
    }

    return;
  }

  if (action === "add-sequence") {
    const select = target.form?.elements.namedItem("sequenceCardId");

    if (select instanceof HTMLSelectElement) {
      await saveAndRender(appendSequenceCard(currentState, select.value));
    }
  }
}

async function handleAddSequenceStep(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  if (!currentState || !(event.currentTarget instanceof HTMLFormElement)) {
    return;
  }

  const select = event.currentTarget.elements.namedItem("sequenceCardId");

  if (select instanceof HTMLSelectElement) {
    await saveAndRender(appendSequenceCard(currentState, select.value));
  }
}

async function handlePresetAction(event: MouseEvent): Promise<void> {
  const target = event.target;

  if (!currentState || !(target instanceof HTMLButtonElement)) {
    return;
  }

  const presetId = target.dataset.presetId;
  const preset = firstThenPresets.find((item) => item.id === presetId);

  if (!preset) {
    return;
  }

  await saveAndRender(applyFirstThenPreset(currentState, preset));
}

async function handlePoolAction(event: MouseEvent): Promise<void> {
  const target = event.target;

  if (!currentState || !(target instanceof HTMLButtonElement)) {
    return;
  }

  const action = target.dataset.action;
  const cardId = target.dataset.cardId;

  if (!cardId) {
    return;
  }

  if (action === "delete") {
    await saveAndRender(deletePoolCard(currentState, cardId));
    return;
  }

  if (action === "select-now") {
    await saveAndRender(selectNowCard(currentState, cardId));
    return;
  }

  if (action === "select-next") {
    await saveAndRender(selectNextCard(currentState, cardId));
    return;
  }

  if (action === "edit") {
    const card = findCard(currentState, cardId);

    if (!card) {
      return;
    }

    const emoji = window.prompt(t("emoji"), card.emoji);

    if (emoji === null) {
      return;
    }

    const label = window.prompt(t("label"), localizedCardLabel(card));

    if (label === null) {
      return;
    }

    await saveAndRender(updatePoolCard(currentState, cardId, { emoji, label }));
  }
}

function renderPopupState(state: PopupState): void {
  if (!app) {
    return;
  }

  document.documentElement.lang = chrome.i18n.getUILanguage().startsWith("ja") ? "ja" : "en";
  document.title = t("extName");

  const root = document.createElement("main");
  root.className = "popup";

  const modeBar = document.createElement("header");
  modeBar.className = "mode-bar";

  const modeLabel = document.createElement("div");
  modeLabel.className = "mode-bar__label";
  modeLabel.textContent = state.mode === "parent" ? t("parentMode") : t("childMode");

  const modeActions = document.createElement("div");
  modeActions.className = "mode-bar__actions";

  const modeButton = document.createElement("button");
  modeButton.className = "mode-button";
  modeButton.type = "button";
  modeButton.textContent = state.mode === "parent" ? t("childMode") : t("parentMode");
  modeButton.setAttribute(
    "aria-label",
    interpolate("switchModeAria", {
      mode: state.mode === "parent" ? t("childMode") : t("parentMode"),
    }),
  );
  modeButton.addEventListener("click", () => {
    void (state.mode === "parent" ? handleEnterChildMode() : handleEnterParentMode());
  });
  modeActions.append(modeButton);

  if (state.mode === "parent") {
    const pinButton = document.createElement("button");
    pinButton.className = "mode-button";
    pinButton.type = "button";
    pinButton.textContent = t("changePin");
    pinButton.setAttribute("aria-label", t("changePinAria"));
    pinButton.addEventListener("click", () => {
      void handleChangePin();
    });
    modeActions.append(pinButton);
  }

  modeBar.append(modeLabel, modeActions);

  const stage = document.createElement("div");
  stage.className = "stage";
  stage.append(renderBigCard(t("now"), state.now), renderBigCard(t("next"), state.next));

  const completeButton = document.createElement("button");
  completeButton.className = "complete-button";
  completeButton.type = "button";
  completeButton.textContent = t("completeNow");
  completeButton.setAttribute("aria-label", t("completeNowAria"));
  completeButton.addEventListener("click", () => {
    void handleCompleteNow();
  });

  const presetSection = document.createElement("section");
  presetSection.className = "presets";

  const presetTitle = document.createElement("h2");
  presetTitle.textContent = t("presets");

  const presetGrid = document.createElement("div");
  presetGrid.className = "preset-grid";
  presetGrid.addEventListener("click", (event) => {
    void handlePresetAction(event);
  });

  firstThenPresets.forEach((preset) => {
    const button = document.createElement("button");
    button.className = "preset-button";
    button.type = "button";
    button.textContent = localizedPresetLabel(preset.id, preset.label);
    button.dataset.presetId = preset.id;
    button.setAttribute("aria-label", interpolate("presetAria", { preset: button.textContent }));
    presetGrid.append(button);
  });

  presetSection.append(presetTitle, presetGrid);

  const poolSection = document.createElement("section");
  poolSection.className = "pool";

  const poolTitle = document.createElement("h2");
  poolTitle.textContent = t("cardPool");

  const form = renderCardForm();
  form.addEventListener("submit", (event) => {
    void handleAddCard(event);
  });

  const poolGrid = document.createElement("div");
  poolGrid.className = "pool-grid";
  poolGrid.addEventListener("click", (event) => {
    void handlePoolAction(event);
  });
  state.pool.forEach((card) => poolGrid.append(renderPoolCard(card, state)));

  poolSection.append(poolTitle, form, poolGrid);

  const premiumSection = renderPremiumSection(state);
  root.append(modeBar, stage, completeButton);

  if (state.mode === "parent") {
    root.append(premiumSection, presetSection, poolSection);
  }

  app.replaceChildren(root);
}

function renderPremiumSection(state: PopupState): HTMLElement {
  const access = getPremiumAccess(state.premium);
  const section = document.createElement("section");
  section.className = "premium";

  const title = document.createElement("h2");
  title.textContent = t("premium");

  const status = document.createElement("p");
  status.className = "premium__status";
  status.textContent = access.enabled
    ? access.trialActive
      ? t("premiumTrialActive").replace("$days$", String(access.trialDaysLeft))
      : t("premiumUnlocked")
    : t("premiumLocked");

  const actions = document.createElement("div");
  actions.className = "premium__actions";

  if (!state.premium.trialStartedAt) {
    const trialButton = document.createElement("button");
    trialButton.type = "button";
    trialButton.textContent = t("startTrial");
    trialButton.setAttribute("aria-label", t("startTrialAria"));
    trialButton.addEventListener("click", () => {
      void handleStartTrial();
    });
    actions.append(trialButton);
  }

  const checkoutButton = document.createElement("button");
  checkoutButton.type = "button";
  checkoutButton.textContent = t("stripeCheckout");
  checkoutButton.setAttribute("aria-label", t("stripeCheckoutAria"));
  checkoutButton.addEventListener("click", handleOpenCheckout);
  actions.append(checkoutButton);

  const sequenceTitle = document.createElement("h3");
  sequenceTitle.textContent = t("sequence");

  const sequenceList = document.createElement("div");
  sequenceList.className = "sequence-list";
  sequenceList.addEventListener("change", (event) => {
    void handleSequenceAction(event);
  });
  sequenceList.addEventListener("click", (event) => {
    void handleSequenceAction(event);
  });

  state.sequence.forEach((card, index) => {
    const row = document.createElement("div");
    row.className = "sequence-row";

    const label = document.createElement("label");
    label.textContent = `${index + 1}.`;

    const select = document.createElement("select");
    select.name = `sequence-${index}`;
    select.dataset.sequenceIndex = String(index);
    select.disabled = !access.enabled && index > 1;
    select.setAttribute(
      "aria-label",
      interpolate("sequenceStepAria", {
        number: String(index + 1),
        card: cardAccessibleName(card),
      }),
    );

    state.pool.forEach((poolCard) => {
      const option = document.createElement("option");
      option.value = poolCard.id;
      option.textContent = `${poolCard.emoji} ${localizedCardLabel(poolCard)}`;
      option.selected = poolCard.id === card.id;
      select.append(option);
    });

    label.append(select);
    row.append(label);

    if (index > 1) {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.textContent = t("delete");
      removeButton.dataset.action = "remove-sequence";
      removeButton.dataset.sequenceIndex = String(index);
      removeButton.disabled = !access.enabled;
      removeButton.setAttribute(
        "aria-label",
        interpolate("removeSequenceStepAria", { number: String(index + 1) }),
      );
      row.append(removeButton);
    }

    sequenceList.append(row);
  });

  const addForm = document.createElement("form");
  addForm.className = "sequence-add";
  addForm.addEventListener("submit", (event) => {
    void handleAddSequenceStep(event);
  });

  const select = document.createElement("select");
  select.name = "sequenceCardId";
  select.disabled = !access.enabled;
  select.setAttribute("aria-label", t("addSequenceStepAria"));

  state.pool.forEach((card) => {
    const option = document.createElement("option");
    option.value = card.id;
    option.textContent = `${card.emoji} ${localizedCardLabel(card)}`;
    select.append(option);
  });

  const addButton = document.createElement("button");
  addButton.type = "submit";
  addButton.textContent = t("addStep");
  addButton.dataset.action = "add-sequence";
  addButton.disabled = !access.enabled;
  addButton.setAttribute("aria-label", t("addStepAria"));

  addForm.append(select, addButton);
  section.append(title, status, actions, sequenceTitle, sequenceList, addForm);
  return section;
}

async function renderPopup(): Promise<void> {
  const state = await loadPopupState(store);
  currentState = state;
  renderPopupState(state);
}

function applyPopupStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    :root {
      color: #243044;
      background: #f8fbff;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    body {
      width: 380px;
      margin: 0;
      padding: 16px;
      background:
        linear-gradient(180deg, #eaf6ff 0%, #f8fbff 42%, #fff7e8 100%);
      box-sizing: border-box;
    }

    h2 {
      margin: 0;
      color: #30415f;
      font-size: 15px;
      line-height: 1.3;
    }

    h3 {
      margin: 0;
      color: #30415f;
      font-size: 14px;
      line-height: 1.3;
    }

    button:focus-visible,
    input:focus-visible,
    select:focus-visible {
      outline: 4px solid #0b5cab;
      outline-offset: 3px;
    }

    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .popup {
      display: grid;
      gap: 16px;
    }

    .mode-bar {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 8px;
    }

    .mode-bar__label {
      min-width: 0;
      font-size: 14px;
      font-weight: 800;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }

    .mode-bar__actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .mode-button {
      min-height: 40px;
      padding: 8px 12px;
      border: 2px solid #8ea6c6;
      border-radius: 14px;
      background: #ffffff;
      color: #243044;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 2px 0 rgba(36, 48, 68, 0.08);
    }

    .stage {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .stage-card {
      min-height: 184px;
      display: grid;
      grid-template-rows: auto 1fr auto;
      align-items: center;
      gap: 10px;
      padding: 14px 12px 16px;
      border: 3px solid #ffffff;
      border-radius: 24px;
      background: #ffffff;
      box-sizing: border-box;
      box-shadow: 0 8px 18px rgba(77, 106, 142, 0.14);
      text-align: center;
    }

    .stage-card:first-child {
      background: #fff4d8;
      border-color: #ffd37a;
    }

    .stage-card:nth-child(2) {
      background: #e9f8ee;
      border-color: #94d7aa;
    }

    .stage-card__emoji {
      font-size: 68px;
      line-height: 1;
    }

    .stage-card__label {
      font-size: 22px;
      font-weight: 700;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }

    .complete-button {
      min-height: 56px;
      border: 2px solid #0f4f40;
      border-radius: 20px;
      background: #166f59;
      color: #ffffff;
      font: inherit;
      font-size: 20px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 4px 0 #0f4f40;
    }

    .presets,
    .pool,
    .premium {
      display: grid;
      gap: 10px;
    }

    .premium__status {
      margin: 0;
      color: #4a5870;
      font-size: 13px;
      line-height: 1.4;
    }

    .premium__actions,
    .sequence-add {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }

    .premium button,
    .sequence-row button {
      min-height: 40px;
      padding: 8px 12px;
      border: 2px solid #8ea6c6;
      border-radius: 14px;
      background: #ffffff;
      color: #243044;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }

    .premium button:disabled,
    .premium select:disabled {
      cursor: default;
      opacity: 0.55;
    }

    .sequence-list {
      display: grid;
      gap: 6px;
    }

    .sequence-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 6px;
      align-items: center;
    }

    .sequence-row label {
      display: grid;
      grid-template-columns: 28px 1fr;
      align-items: center;
      gap: 6px;
      min-width: 0;
      font-size: 12px;
      font-weight: 800;
    }

    .premium select {
      min-width: 0;
      height: 34px;
      padding: 5px 8px;
      border: 2px solid #cad7e8;
      border-radius: 12px;
      background: #ffffff;
      color: inherit;
      font: inherit;
    }

    .preset-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .preset-button {
      min-height: 44px;
      padding: 10px 12px;
      border: 2px solid #cad7e8;
      border-radius: 16px;
      background: #ffffff;
      color: #243044;
      font: inherit;
      font-weight: 700;
      text-align: left;
      cursor: pointer;
    }

    .card-form {
      display: grid;
      grid-template-columns: 72px 1fr auto;
      gap: 8px;
      align-items: center;
    }

    .card-form input {
      min-width: 0;
      height: 44px;
      padding: 8px 10px;
      border: 2px solid #cad7e8;
      border-radius: 14px;
      box-sizing: border-box;
      background: #ffffff;
      color: inherit;
      font: inherit;
    }

    .card-form button,
    .icon-button {
      min-height: 44px;
      padding: 8px 12px;
      border: 2px solid #0f4f40;
      border-radius: 14px;
      background: #166f59;
      color: #ffffff;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }

    .pool-grid {
      display: grid;
      gap: 10px;
    }

    .pool-card {
      min-height: 68px;
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border: 2px solid #dce6f3;
      border-radius: 18px;
      background: #ffffff;
      color: inherit;
      font: inherit;
      font-weight: 700;
      text-align: left;
      box-shadow: 0 3px 10px rgba(77, 106, 142, 0.08);
    }

    .pool-card__emoji {
      font-size: 36px;
      line-height: 1;
    }

    .pool-card__text {
      min-width: 0;
      display: grid;
      gap: 4px;
    }

    .pool-card__label {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .pool-card__status {
      width: fit-content;
      max-width: 100%;
      padding: 2px 7px;
      border: 1px solid #8ea6c6;
      border-radius: 999px;
      background: #f4f8fd;
      color: #30415f;
      font-size: 11px;
      font-weight: 800;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }

    .pool-card__actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .icon-button {
      min-height: 36px;
      padding: 6px 10px;
      background: #ffffff;
      color: #243044;
      font-size: 12px;
    }

    .icon-button[aria-pressed="true"] {
      border-color: #166f59;
      background: #dff5e8;
      color: #183f35;
    }
  `;
  document.head.append(style);
}

applyPopupStyles();
void renderPopup();
