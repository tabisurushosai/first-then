import {
  addCardToPool,
  appendSequenceCard,
  applySavedPair,
  applyFirstThenPreset,
  completeNowCard,
  deletePoolCard,
  deleteSavedPair,
  getSequencePreviewCard,
  removeSequenceCard,
  replaceSequenceCard,
  saveCurrentPair,
  selectNextCard,
  selectNowCard,
  setSequencePreviewEnabled,
  type Card,
  type CardInput,
  type PopupState,
  type SavedPair,
  updatePoolCard,
} from "./core/cards";
import { createCompletionCelebration, type CompletionCelebration } from "./core/celebration";
import { setParentPin, switchToChildMode, switchToParentMode } from "./core/mode";
import { getPremiumAccess, startPremiumTrial, stripeCheckoutUrl } from "./core/premium";
import { firstThenPresets, presetCards } from "./core/presets";
import { loadPopupState, savePopupState } from "./core/state";
import { store } from "./storage";

const app = document.querySelector<HTMLDivElement>("#app");
let currentState: PopupState | null = null;
let pendingUndo: PendingUndo | null = null;
let activeCelebration: CompletionCelebration | null = null;

interface PendingUndo {
  message: string;
  state: PopupState;
}

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

function createPairId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `pair-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function findPairCard(state: PopupState, cardId: string): Card | null {
  return state.pool.find((card) => card.id === cardId) ?? null;
}

function pairAccessibleName(state: PopupState, pair: SavedPair): string {
  const now = findPairCard(state, pair.nowCardId);
  const next = findPairCard(state, pair.nextCardId);

  if (!now || !next) {
    return t("savedPairMissing");
  }

  return `${cardAccessibleName(now)} ${t("pairArrow")} ${cardAccessibleName(next)}`;
}

function isCurrentPairSaved(state: PopupState): boolean {
  return state.savedPairs.some(
    (pair) => pair.nowCardId === state.now.id && pair.nextCardId === state.next.id,
  );
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

async function saveAndRender(
  state: PopupState,
  undo: PendingUndo | null = null,
  celebration: CompletionCelebration | null = null,
): Promise<void> {
  currentState = state;
  pendingUndo = undo;
  activeCelebration = celebration;
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

function renderEmptyState(message: string): HTMLParagraphElement {
  const emptyState = document.createElement("p");
  emptyState.className = "empty-state";
  emptyState.textContent = message;
  return emptyState;
}

async function handleUndo(): Promise<void> {
  if (!pendingUndo) {
    return;
  }

  await saveAndRender(pendingUndo.state);
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

  const completedCard = currentState.now;
  await saveAndRender(
    completeNowCard(currentState),
    null,
    createCompletionCelebration(completedCard),
  );
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

async function handleSequencePreviewToggle(event: Event): Promise<void> {
  if (!currentState || !(event.currentTarget instanceof HTMLInputElement)) {
    return;
  }

  await saveAndRender(setSequencePreviewEnabled(currentState, event.currentTarget.checked));
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
      const nextState = removeSequenceCard(currentState, index);

      if (
        nextState !== currentState &&
        window.confirm(interpolate("removeSequenceStepConfirm", { number: String(index + 1) }))
      ) {
        await saveAndRender(nextState, {
          message: interpolate("sequenceStepRemovedUndo", { number: String(index + 1) }),
          state: currentState,
        });
      }
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

async function handleSaveCurrentPair(): Promise<void> {
  if (!currentState) {
    return;
  }

  await saveAndRender(saveCurrentPair(currentState, createPairId()));
}

async function handleSavedPairAction(event: MouseEvent): Promise<void> {
  const target = event.target;

  if (!currentState || !(target instanceof HTMLButtonElement)) {
    return;
  }

  const pairId = target.dataset.pairId;

  if (!pairId) {
    return;
  }

  if (target.dataset.action === "delete-pair") {
    const pair = currentState.savedPairs.find((item) => item.id === pairId);

    if (!pair) {
      return;
    }

    const nextState = deleteSavedPair(currentState, pairId);

    if (
      nextState !== currentState &&
      window.confirm(interpolate("deleteSavedPairConfirm", { pair: pairAccessibleName(currentState, pair) }))
    ) {
      await saveAndRender(nextState, {
        message: interpolate("savedPairDeletedUndo", { pair: pairAccessibleName(currentState, pair) }),
        state: currentState,
      });
    }

    return;
  }

  await saveAndRender(applySavedPair(currentState, pairId));
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
    const card = findCard(currentState, cardId);

    if (!card) {
      return;
    }

    const nextState = deletePoolCard(currentState, cardId);

    if (
      nextState !== currentState &&
      window.confirm(interpolate("deleteCardConfirm", { card: cardAccessibleName(card) }))
    ) {
      await saveAndRender(nextState, {
        message: interpolate("cardDeletedUndo", { card: cardAccessibleName(card) }),
        state: currentState,
      });
    }

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
  root.className = `popup popup--${state.mode}`;

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

  const previewCard = getSequencePreviewCard(state);

  if (previewCard) {
    stage.append(renderPreviewCard(previewCard));
  }

  const completeButton = document.createElement("button");
  completeButton.className = "complete-button";
  completeButton.type = "button";
  completeButton.textContent = t("completeNow");
  completeButton.setAttribute("aria-label", t("completeNowAria"));
  completeButton.addEventListener("click", () => {
    void handleCompleteNow();
  });

  const celebration = renderCompletionCelebration();
  const undoNotice = renderUndoNotice();

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

  if (firstThenPresets.length === 0) {
    presetGrid.append(renderEmptyState(t("presetEmpty")));
  }

  presetSection.append(presetTitle, presetGrid);

  const savedPairsSection = renderSavedPairsSection(state);
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
  if (state.pool.length === 0) {
    poolGrid.append(renderEmptyState(t("cardPoolEmpty")));
  } else {
    state.pool.forEach((card) => poolGrid.append(renderPoolCard(card, state)));
  }

  poolSection.append(poolTitle, form, poolGrid);

  const premiumSection = renderPremiumSection(state);
  root.append(modeBar, stage, completeButton);
  if (celebration) {
    root.append(celebration);
  }
  if (undoNotice) {
    root.append(undoNotice);
  }

  if (state.mode === "parent") {
    root.append(premiumSection, savedPairsSection, presetSection, poolSection);
  }

  app.replaceChildren(root);
}

function renderPreviewCard(card: Card): HTMLElement {
  const section = document.createElement("section");
  section.className = "stage-card stage-card--preview";
  section.setAttribute("aria-label", `${t("previewNext")}: ${cardAccessibleName(card)}`);

  const heading = document.createElement("h2");
  heading.textContent = t("previewNext");

  const emoji = document.createElement("div");
  emoji.className = "stage-card__emoji";
  emoji.textContent = card.emoji;

  const label = document.createElement("div");
  label.className = "stage-card__label";
  label.textContent = localizedCardLabel(card);

  section.append(heading, emoji, label);
  return section;
}

function renderSavedPairsSection(state: PopupState): HTMLElement {
  const section = document.createElement("section");
  section.className = "saved-pairs";

  const title = document.createElement("h2");
  title.textContent = t("savedPairs");

  const saveButton = document.createElement("button");
  saveButton.className = "save-pair-button";
  saveButton.type = "button";
  saveButton.textContent = isCurrentPairSaved(state) ? t("savedPairAlreadySaved") : t("saveCurrentPair");
  saveButton.disabled = isCurrentPairSaved(state);
  saveButton.setAttribute(
    "aria-label",
    interpolate("saveCurrentPairAria", {
      pair: `${cardAccessibleName(state.now)} ${t("pairArrow")} ${cardAccessibleName(state.next)}`,
    }),
  );
  saveButton.addEventListener("click", () => {
    void handleSaveCurrentPair();
  });

  const list = document.createElement("div");
  list.className = "saved-pair-list";
  list.addEventListener("click", (event) => {
    void handleSavedPairAction(event);
  });

  const availablePairs = state.savedPairs.filter(
    (pair) => findPairCard(state, pair.nowCardId) && findPairCard(state, pair.nextCardId),
  );

  if (availablePairs.length === 0) {
    list.append(renderEmptyState(t("savedPairsEmpty")));
  } else {
    availablePairs.forEach((pair) => {
      const row = document.createElement("div");
      row.className = "saved-pair-row";

      const applyButton = document.createElement("button");
      applyButton.className = "saved-pair-button";
      applyButton.type = "button";
      applyButton.dataset.pairId = pair.id;
      applyButton.setAttribute(
        "aria-label",
        interpolate("useSavedPairAria", { pair: pairAccessibleName(state, pair) }),
      );

      const now = findPairCard(state, pair.nowCardId);
      const next = findPairCard(state, pair.nextCardId);

      if (now && next) {
        applyButton.textContent = `${now.emoji} ${localizedCardLabel(now)} ${t("pairArrow")} ${next.emoji} ${localizedCardLabel(next)}`;
      }

      const deleteButton = document.createElement("button");
      deleteButton.className = "saved-pair-delete";
      deleteButton.type = "button";
      deleteButton.textContent = t("delete");
      deleteButton.dataset.action = "delete-pair";
      deleteButton.dataset.pairId = pair.id;
      deleteButton.setAttribute(
        "aria-label",
        interpolate("deleteSavedPairAria", { pair: pairAccessibleName(state, pair) }),
      );

      row.append(applyButton, deleteButton);
      list.append(row);
    });
  }

  section.append(title, saveButton, list);
  return section;
}

function renderCompletionCelebration(): HTMLElement | null {
  if (!activeCelebration) {
    return null;
  }

  const notice = document.createElement("aside");
  notice.className = "completion-celebration";
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");
  notice.setAttribute(
    "aria-label",
    interpolate("completionCelebrationAria", {
      card: cardAccessibleName(activeCelebration.completedCard),
    }),
  );

  const sparkleRow = document.createElement("div");
  sparkleRow.className = "completion-celebration__sparkles";
  sparkleRow.setAttribute("aria-hidden", "true");

  activeCelebration.sparkles.forEach((sparkle) => {
    const item = document.createElement("span");
    item.textContent = sparkle;
    sparkleRow.append(item);
  });

  const message = document.createElement("strong");
  message.className = "completion-celebration__message";
  message.textContent = t("completionCelebration");

  const card = document.createElement("span");
  card.className = "completion-celebration__card";
  card.textContent = cardAccessibleName(activeCelebration.completedCard);

  notice.append(sparkleRow, message, card);
  return notice;
}

function renderUndoNotice(): HTMLElement | null {
  if (!pendingUndo) {
    return null;
  }

  const notice = document.createElement("aside");
  notice.className = "undo-notice";
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");

  const message = document.createElement("span");
  message.textContent = pendingUndo.message;

  const undoButton = document.createElement("button");
  undoButton.type = "button";
  undoButton.textContent = t("undo");
  undoButton.setAttribute("aria-label", t("undoAria"));
  undoButton.addEventListener("click", () => {
    void handleUndo();
  });

  notice.append(message, undoButton);
  return notice;
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

  const previewLabel = document.createElement("label");
  previewLabel.className = "sequence-preview-toggle";

  const previewToggle = document.createElement("input");
  previewToggle.type = "checkbox";
  previewToggle.checked = state.sequencePreviewEnabled && access.enabled;
  previewToggle.disabled = !access.enabled;
  previewToggle.addEventListener("change", (event) => {
    void handleSequencePreviewToggle(event);
  });

  const previewText = document.createElement("span");
  previewText.textContent = access.enabled ? t("sequencePreviewOption") : t("sequencePreviewLocked");

  previewLabel.append(previewToggle, previewText);

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

  if (state.sequence.length <= 2) {
    sequenceList.append(renderEmptyState(t("extraStepsEmpty")));
  }

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
  section.append(title, status, actions, sequenceTitle, previewLabel, sequenceList, addForm);
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
      --color-text: #243044;
      --color-heading: #30415f;
      --color-muted: #4a5870;
      --color-surface: #ffffff;
      --color-page: #f8fbff;
      --color-page-start: #eaf6ff;
      --color-page-end: #fff7e8;
      --color-border: #cad7e8;
      --color-border-strong: #8ea6c6;
      --color-border-soft: #dce6f3;
      --color-focus: #0b5cab;
      --color-primary: #166f59;
      --color-primary-dark: #0f4f40;
      --color-primary-soft: #dff5e8;
      --color-primary-text: #183f35;
      --color-now: #fff4d8;
      --color-now-border: #ffd37a;
      --color-next: #e9f8ee;
      --color-next-border: #94d7aa;
      --color-preview: #eef4ff;
      --color-preview-border: #a9bee8;
      --color-chip: #f4f8fd;
      --color-celebration: #fff9ea;
      --space-2xs: 4px;
      --space-xs: 6px;
      --space-sm: 8px;
      --space-md: 10px;
      --space-lg: 12px;
      --space-xl: 14px;
      --space-2xl: 16px;
      --space-3xl: 18px;
      --radius-sm: 12px;
      --radius-md: 14px;
      --radius-lg: 16px;
      --radius-xl: 18px;
      --radius-2xl: 20px;
      --radius-card: 24px;
      --radius-pill: 999px;
      --font-xs: 11px;
      --font-sm: 12px;
      --font-md: 13px;
      --font-lg: 14px;
      --font-xl: 15px;
      --font-2xl: 18px;
      --font-action: 20px;
      --font-celebration: 24px;
      --font-emoji-preview: 46px;
      --font-emoji-preview-large: 56px;
      --font-emoji-stage: 68px;
      --font-emoji-child: 104px;
      --font-emoji-pool: 36px;
      --font-stage: 22px;
      --font-stage-large: 28px;
      --shadow-sm: 0 2px 0 rgba(36, 48, 68, 0.08);
      --shadow-md: 0 3px 10px rgba(77, 106, 142, 0.08);
      --shadow-lg: 0 6px 16px rgba(77, 106, 142, 0.12);
      --shadow-card: 0 8px 18px rgba(77, 106, 142, 0.14);
      color: var(--color-text);
      background: var(--color-page);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    body {
      width: 380px;
      margin: 0;
      padding: var(--space-2xl);
      background:
        linear-gradient(180deg, var(--color-page-start) 0%, var(--color-page) 42%, var(--color-page-end) 100%);
      box-sizing: border-box;
    }

    h2 {
      margin: 0;
      color: var(--color-heading);
      font-size: var(--font-xl);
      line-height: 1.3;
    }

    h3 {
      margin: 0;
      color: var(--color-heading);
      font-size: var(--font-lg);
      line-height: 1.3;
    }

    button:focus-visible,
    input:focus-visible,
    select:focus-visible {
      outline: 4px solid var(--color-focus);
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
      gap: var(--space-2xl);
    }

    .mode-bar {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: var(--space-sm);
    }

    .mode-bar__label {
      min-width: 0;
      font-size: var(--font-lg);
      font-weight: 800;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }

    .mode-bar__actions {
      display: flex;
      gap: var(--space-xs);
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .mode-button {
      min-height: 40px;
      padding: var(--space-sm) var(--space-lg);
      border: 2px solid var(--color-border-strong);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-text);
      font: inherit;
      font-size: var(--font-md);
      font-weight: 700;
      cursor: pointer;
      box-shadow: var(--shadow-sm);
    }

    .stage {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-lg);
    }

    .stage-card {
      min-height: 184px;
      display: grid;
      grid-template-rows: auto 1fr auto;
      align-items: center;
      gap: var(--space-md);
      padding: var(--space-xl) var(--space-lg) var(--space-2xl);
      border: 3px solid var(--color-surface);
      border-radius: var(--radius-card);
      background: var(--color-surface);
      box-sizing: border-box;
      box-shadow: var(--shadow-card);
      text-align: center;
    }

    .stage-card:first-child {
      background: var(--color-now);
      border-color: var(--color-now-border);
    }

    .stage-card:nth-child(2) {
      background: var(--color-next);
      border-color: var(--color-next-border);
    }

    .stage-card--preview {
      grid-column: 1 / -1;
      min-height: 118px;
      grid-template-columns: auto 1fr;
      grid-template-rows: auto auto;
      column-gap: var(--space-lg);
      background: var(--color-preview);
      border-color: var(--color-preview-border);
    }

    .stage-card--preview h2 {
      grid-column: 1 / -1;
    }

    .stage-card--preview .stage-card__emoji {
      font-size: var(--font-emoji-preview);
    }

    .stage-card--preview .stage-card__label {
      font-size: var(--font-2xl);
      text-align: left;
    }

    .stage-card__emoji {
      font-size: var(--font-emoji-stage);
      line-height: 1;
    }

    .stage-card__label {
      font-size: var(--font-stage);
      font-weight: 700;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }

    .popup--child .stage {
      grid-template-columns: 1fr;
    }

    .popup--child .stage-card {
      min-height: 238px;
      padding: var(--space-3xl) var(--space-xl) var(--radius-2xl);
    }

    .popup--child .stage-card__emoji {
      font-size: var(--font-emoji-child);
    }

    .popup--child .stage-card__label {
      font-size: var(--font-stage-large);
    }

    .popup--child .stage-card--preview {
      min-height: 138px;
      grid-template-columns: auto 1fr;
      padding: var(--space-2xl) var(--space-xl);
    }

    .popup--child .stage-card--preview .stage-card__emoji {
      font-size: var(--font-emoji-preview-large);
    }

    .popup--child .stage-card--preview .stage-card__label {
      font-size: var(--font-stage);
    }

    .complete-button {
      min-height: 56px;
      border: 2px solid var(--color-primary-dark);
      border-radius: var(--radius-2xl);
      background: var(--color-primary);
      color: var(--color-surface);
      font: inherit;
      font-size: var(--font-action);
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 4px 0 var(--color-primary-dark);
    }

    .completion-celebration {
      display: grid;
      justify-items: center;
      gap: var(--space-2xs);
      padding: var(--space-lg);
      border: 2px solid var(--color-now-border);
      border-radius: var(--radius-2xl);
      background: var(--color-celebration);
      color: var(--color-text);
      text-align: center;
      box-shadow: var(--shadow-lg);
      animation: celebration-pop 520ms ease-out both;
    }

    .completion-celebration__sparkles {
      display: flex;
      gap: var(--space-lg);
      font-size: var(--font-celebration);
      line-height: 1;
    }

    .completion-celebration__sparkles span {
      animation: sparkle-bounce 720ms ease-out both;
    }

    .completion-celebration__sparkles span:nth-child(2) {
      animation-delay: 80ms;
    }

    .completion-celebration__sparkles span:nth-child(3) {
      animation-delay: 160ms;
    }

    .completion-celebration__message {
      font-size: var(--font-stage);
      line-height: 1.2;
      overflow-wrap: anywhere;
    }

    .completion-celebration__card {
      color: var(--color-muted);
      font-size: var(--font-md);
      font-weight: 800;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }

    @keyframes celebration-pop {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.96);
      }

      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes sparkle-bounce {
      0% {
        transform: translateY(4px) scale(0.72);
      }

      55% {
        transform: translateY(-5px) scale(1.12);
      }

      100% {
        transform: translateY(0) scale(1);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .completion-celebration,
      .completion-celebration__sparkles span {
        animation: none;
      }
    }

    .presets,
    .pool,
    .saved-pairs,
    .premium {
      display: grid;
      gap: var(--space-md);
    }

    .premium__status {
      margin: 0;
      color: var(--color-muted);
      font-size: var(--font-md);
      line-height: 1.4;
    }

    .empty-state {
      margin: 0;
      color: var(--color-muted);
      font-size: var(--font-md);
      line-height: 1.4;
    }

    .undo-notice {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: var(--space-sm);
      padding: var(--space-md) var(--space-lg);
      border: 2px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      color: var(--color-text);
      font-size: var(--font-md);
      font-weight: 700;
      box-shadow: var(--shadow-md);
    }

    .undo-notice button {
      min-height: 36px;
      padding: var(--space-xs) var(--space-md);
      border: 2px solid var(--color-primary-dark);
      border-radius: var(--radius-sm);
      background: var(--color-primary);
      color: var(--color-surface);
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }

    .premium__actions,
    .sequence-add {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-xs);
    }

    .premium button,
    .sequence-row button {
      min-height: 40px;
      padding: var(--space-sm) var(--space-lg);
      border: 2px solid var(--color-border-strong);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-text);
      font: inherit;
      font-size: var(--font-md);
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
      gap: var(--space-xs);
    }

    .sequence-preview-toggle {
      min-height: 42px;
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: var(--space-sm);
      padding: var(--space-sm) var(--space-md);
      border: 2px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-text);
      font-size: var(--font-md);
      font-weight: 800;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }

    .sequence-preview-toggle input {
      width: 20px;
      height: 20px;
      margin: 0;
      accent-color: var(--color-primary);
    }

    .sequence-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--space-xs);
      align-items: center;
    }

    .sequence-row label {
      display: grid;
      grid-template-columns: 28px 1fr;
      align-items: center;
      gap: var(--space-xs);
      min-width: 0;
      font-size: var(--font-sm);
      font-weight: 800;
    }

    .premium select {
      min-width: 0;
      height: 34px;
      padding: 5px var(--space-sm);
      border: 2px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: inherit;
      font: inherit;
    }

    .preset-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--space-sm);
    }

    .saved-pair-list {
      display: grid;
      gap: var(--space-sm);
    }

    .saved-pair-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--space-xs);
      align-items: center;
    }

    .preset-button,
    .save-pair-button,
    .saved-pair-button,
    .saved-pair-delete {
      min-height: 44px;
      padding: var(--space-md) var(--space-lg);
      border: 2px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      color: var(--color-text);
      font: inherit;
      font-weight: 700;
      text-align: left;
      cursor: pointer;
    }

    .save-pair-button,
    .saved-pair-delete {
      text-align: center;
    }

    .save-pair-button {
      border-color: var(--color-primary-dark);
      background: var(--color-primary);
      color: var(--color-surface);
      font-weight: 800;
    }

    .save-pair-button:disabled {
      cursor: default;
      opacity: 0.62;
    }

    .saved-pair-delete {
      border-color: var(--color-border-strong);
      font-size: var(--font-sm);
    }

    .card-form {
      display: grid;
      grid-template-columns: 72px 1fr auto;
      gap: var(--space-sm);
      align-items: center;
    }

    .card-form input {
      min-width: 0;
      height: 44px;
      padding: var(--space-sm) var(--space-md);
      border: 2px solid var(--color-border);
      border-radius: var(--radius-md);
      box-sizing: border-box;
      background: var(--color-surface);
      color: inherit;
      font: inherit;
    }

    .card-form button,
    .icon-button {
      min-height: 44px;
      padding: var(--space-sm) var(--space-lg);
      border: 2px solid var(--color-primary-dark);
      border-radius: var(--radius-md);
      background: var(--color-primary);
      color: var(--color-surface);
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }

    .pool-grid {
      display: grid;
      gap: var(--space-md);
    }

    .pool-card {
      min-height: 68px;
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: var(--space-md);
      padding: var(--space-md) var(--space-lg);
      border: 2px solid var(--color-border-soft);
      border-radius: var(--radius-xl);
      background: var(--color-surface);
      color: inherit;
      font: inherit;
      font-weight: 700;
      text-align: left;
      box-shadow: var(--shadow-md);
    }

    .pool-card__emoji {
      font-size: var(--font-emoji-pool);
      line-height: 1;
    }

    .pool-card__text {
      min-width: 0;
      display: grid;
      gap: var(--space-2xs);
    }

    .pool-card__label {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .pool-card__status {
      width: fit-content;
      max-width: 100%;
      padding: 2px 7px;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-pill);
      background: var(--color-chip);
      color: var(--color-heading);
      font-size: var(--font-xs);
      font-weight: 800;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }

    .pool-card__actions {
      display: flex;
      gap: var(--space-xs);
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .icon-button {
      min-height: 36px;
      padding: var(--space-xs) var(--space-md);
      background: var(--color-surface);
      color: var(--color-text);
      font-size: var(--font-sm);
    }

    .icon-button[aria-pressed="true"] {
      border-color: var(--color-primary);
      background: var(--color-primary-soft);
      color: var(--color-primary-text);
    }
  `;
  document.head.append(style);
}

applyPopupStyles();
void renderPopup();
