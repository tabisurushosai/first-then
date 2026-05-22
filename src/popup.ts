import { createInitialPopupState, type Card } from "./core/cards";

const app = document.querySelector<HTMLDivElement>("#app");

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
  const item = document.createElement("button");
  item.className = "pool-card";
  item.type = "button";
  item.setAttribute("aria-label", card.label);

  const emoji = document.createElement("span");
  emoji.className = "pool-card__emoji";
  emoji.textContent = card.emoji;

  const label = document.createElement("span");
  label.textContent = card.label;

  item.append(emoji, label);
  return item;
}

function renderPopup(): void {
  if (!app) {
    return;
  }

  const state = createInitialPopupState();
  const root = document.createElement("main");
  root.className = "popup";

  const stage = document.createElement("div");
  stage.className = "stage";
  stage.append(renderBigCard("いま", state.now), renderBigCard("つぎ", state.next));

  const poolSection = document.createElement("section");
  poolSection.className = "pool";

  const poolTitle = document.createElement("h2");
  poolTitle.textContent = "カードプール";

  const poolGrid = document.createElement("div");
  poolGrid.className = "pool-grid";
  state.pool.forEach((card) => poolGrid.append(renderPoolCard(card)));

  poolSection.append(poolTitle, poolGrid);
  root.append(stage, poolSection);
  app.replaceChildren(root);
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

    .pool-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .pool-card {
      min-height: 56px;
      display: flex;
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
      cursor: default;
    }

    .pool-card__emoji {
      font-size: 28px;
      line-height: 1;
    }
  `;
  document.head.append(style);
}

applyPopupStyles();
renderPopup();
