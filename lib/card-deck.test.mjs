import test from "node:test";
import assert from "node:assert/strict";
import { DECK_CARD_GAP, isDeckCardOffscreenLeft, deckStep, projectDeckCard, deckSnapTarget } from "./card-deck.ts";

test("every fractional scroll displacement continuously moves both cards", () => {
  const a = projectDeckCard(0, .2, 800), b = projectDeckCard(0, .21, 800);
  assert.ok(b.x < a.x);
  assert.ok(projectDeckCard(1, .21, 800).x < projectDeckCard(1, .2, 800).x);
  assert.equal(projectDeckCard(1, 1, 800).x, 0);
});

test("reversing midway exactly retraces the same positions without queue mutation", () => {
  const forward = [.1, .3, .6, 1, 1.5, 2];
  const samples = forward.map((position) => projectDeckCard(1, position, 800));
  const backward = [...forward].reverse().map((position) => projectDeckCard(1, position, 800));
  assert.deepEqual(backward.reverse(), samples);
});

test("settling chooses the nearest card, not the next card or a gesture threshold", () => {
  const step = deckStep(800);
  assert.equal(deckSnapTarget(.49 * step, step), 0);
  assert.equal(deckSnapTarget(.51 * step, step), step);
  assert.equal(deckSnapTarget(2.7 * step, step), 3 * step);
  assert.equal(deckSnapTarget(1.2 * step, step), step);
});


test("previous card docks with a consistent gap from the center card, independent of sidebar gutter", () => {
  const width = 900;
  const outgoing = projectDeckCard(0, 1, width);
  assert.equal(width * outgoing.scale + outgoing.x, -DECK_CARD_GAP);
  assert.equal(projectDeckCard(1, 1, width).x, 0);
});


test("left cards remain mounted through the gutter and disappear only beyond the viewport", () => {
  const width = 756, bleed = 400;
  const stillVisible = projectDeckCard(0, 1.15, width);
  assert.equal(isDeckCardOffscreenLeft(stillVisible.x, width, bleed), false);
  const hidden = projectDeckCard(0, 2, width);
  assert.equal(isDeckCardOffscreenLeft(hidden.x, width, bleed), true);
  assert.equal(isDeckCardOffscreenLeft(stillVisible.x, width, bleed), false);
  assert.equal(isDeckCardOffscreenLeft(-width - bleed - 64, width, bleed), false);
});


test("right previews expose a substantial slice while preserving centered scaling", () => {
  for (const width of [500, 900]) {
    const next = projectDeckCard(1, 0, width);
    const visibleSlice = next.x + width * next.scale - width;
    assert.ok(visibleSlice >= 100);
    assert.equal(projectDeckCard(0, 0, width).scale, 1);
    assert.ok(next.scale < 1);
  }
});


test("flick velocity selects a neighbor while slow adjustments keep the closest card", () => {
  const step = 800;
  assert.equal(deckSnapTarget(step * .2, step, 4000, step * 3), step);
  assert.equal(deckSnapTarget(step * .8, step, -4000, step * 3), 0);
  assert.equal(deckSnapTarget(step * .2, step, 200, step * 3), 0);
  assert.equal(deckSnapTarget(0, step, -4000, step * 3), 0);
  assert.equal(deckSnapTarget(step * 3, step, 4000, step * 3), step * 3);
});

test("the centered card is largest and scale continuously follows either direction", () => {
  assert.equal(projectDeckCard(1, 1, 900).scale, 1);
  assert.equal(projectDeckCard(1, .6, 900).scale, projectDeckCard(1, 1.4, 900).scale);
  for (let i = 1; i <= 100; i++) {
    assert.ok(projectDeckCard(0, i / 100, 900).x < projectDeckCard(0, (i - 1) / 100, 900).x);
  }
});
