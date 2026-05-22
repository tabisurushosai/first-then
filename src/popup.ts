import {
  addCardToPool,
  deletePoolCard,
  type Card,
  type CardInput,
  type PopupState,
  updatePoolCard,
} from "./core/cards";
import { loadPopupState, savePopupState } from "./core/state";
import { store } from "./storage";

const app = document.querySelector<HTMLDivElement>("#app");
let currentState: PopupState | null = null;

function createCardId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `card-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function renderBigCard(title: string, card: Card): HTMLElement {
  const section = document.createElement("section");
  section.className = "stage-card";
  section.setAttribute("aria-label", title);

  const heading = document.createElement("h2");
  heading.textContent = title;

  const emoji = document.createElement("div");
  emoji.className = "stage-card__emoji";
  emoji.textContent = card.emoji;

  const label = document.createElement("div");
  label.className = "stage-card__label";
  label.textContent = card.label;

  section.append(heading, emoji, label);
  return section;
}

function renderPoolCard(card: Card): HTMLElement {
  const item = document.createElement("div");
  item.className = "pool-card";

  const emoji = document.createElement("span");
  emoji.className = "pool-card__emoji";
  emoji.textContent = card.emoji;

  const label = document.createElement("span");
  label.className = "pool-card__label";
  label.textContent = card.label;

  const actions = document.createElement("div");
  actions.className = "pool-card__actions";

  const editButton = document.createElement("button");
  editButton.className = "icon-button";
  editButton.type = "button";
  editButton.textContent = "編集";
  editButton.dataset.action = "edit";
  editButton.dataset.cardId = card.id;

  const deleteButton = document.createElement("button");
  deleteButton.className = "icon-button";
  deleteButton.type = "button";
  deleteButton.textContent = "削除";
  deleteButton.dataset.action = "delete";
  deleteButton.dataset.cardId = card.id;

  actions.append(editButton, deleteButton);
  item.append(emoji, label, actions);
  return item;
}

function renderCardForm(): HTMLFormElement {
  const form = document.createElement("form");
  form.className = "card-form";

  const emojiInput = document.createElement("input");
  emojiInput.name = "emoji";
  emojiInput.type = "text";
  emojiInput.placeholder = "絵文字";
  emojiInput.setAttribute("aria-label", "絵文字");
  emojiInput.required = true;

  const labelInput = document.createElement("input");
  labelInput.name = "label";
  labelInput.type = "text";
  labelInput.placeholder = "ことば";
  labelInput.setAttribute("aria-label", "ことば");
  labelInput.required = true;

  const addButton = document.createElement("button");
  addButton.type = "submit";
  addButton.textContent = "追加";

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

  if (action === "edit") {
    const card = findCard(currentState, cardId);

    if (!card) {
      return;
    }

    const emoji = window.prompt("絵文字", card.emoji);

    if (emoji === null) {
      return;
    }

    const label = window.prompt("ことば", card.label);

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

  const root = document.createElement("main");
  root.className = "popup";

  const stage = document.createElement("div");
  stage.className = "stage";
  stage.append(renderBigCard("いま", state.now), renderBigCard("つぎ", state.next));

  const poolSection = document.createElement("section");
  poolSection.className = "pool";

  const poolTitle = document.createElement("h2");
  poolTitle.textContent = "カードプール";

  const form = renderCardForm();
  form.addEventListener("submit", (event) => {
    void handleAddCard(event);
  });

  const poolGrid = document.createElement("div");
  poolGrid.className = "pool-grid";
  poolGrid.addEventListener("click", (event) => {
    void handlePoolAction(event);
  });
  state.pool.forEach((card) => poolGrid.append(renderPoolCard(card)));

  poolSection.append(poolTitle, form, poolGrid);
  root.append(stage, poolSection);
  app.replaceChildren(root);
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
      color: #1d2433;
      background: #f7f7f4;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    body {
      width: 360px;
      margin: 0;
      padding: 14px;
      background: #f7f7f4;
      box-sizing: border-box;
    }

    h3 {
      margin: 0 0 12px;
      font-size: 18px;
      line-height: 1.25;
    }

    h2 {
      margin: 0;
      font-size: 14px;
      line-height: 1.3;
    }

    .popup {
      display: grid;
      gap: 14px;
    }

    .stage {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .stage-card {
      min-height: 156px;
      display: grid;
      grid-template-rows: auto 1fr auto;
      align-items: center;
      gap: 8px;
      padding: 12px;
      border: 2px solid #d7d5cb;
      border-radius: 8px;
      background: #ffffff;
      box-sizing: border-box;
      text-align: center;
    }

    .stage-card__emoji {
      font-size: 52px;
      line-height: 1;
    }

    .stage-card__label {
      font-size: 20px;
      font-weight: 700;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }

    .pool {
      display: grid;
      gap: 8px;
    }

    .card-form {
      display: grid;
      grid-template-columns: 64px 1fr auto;
      gap: 6px;
      align-items: center;
    }

    .card-form input {
      min-width: 0;
      height: 36px;
      padding: 6px 8px;
      border: 1px solid #c9c6ba;
      border-radius: 6px;
      box-sizing: border-box;
      background: #ffffff;
      color: inherit;
      font: inherit;
    }

    .card-form button,
    .icon-button {
      min-height: 34px;
      padding: 6px 10px;
      border: 1px solid #817c70;
      border-radius: 6px;
      background: #2f5d50;
      color: #ffffff;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }

    .pool-grid {
      display: grid;
      gap: 8px;
    }

    .pool-card {
      min-height: 56px;
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border: 1px solid #d7d5cb;
      border-radius: 8px;
      background: #ffffff;
      color: inherit;
      font: inherit;
      font-weight: 700;
      text-align: left;
    }

    .pool-card__emoji {
      font-size: 28px;
      line-height: 1;
    }

    .pool-card__label {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .pool-card__actions {
      display: flex;
      gap: 6px;
    }

    .icon-button {
      min-height: 30px;
      padding: 4px 8px;
      background: #ffffff;
      color: #1d2433;
      font-size: 12px;
    }
  `;
  document.head.append(style);
}

applyPopupStyles();
void renderPopup();
