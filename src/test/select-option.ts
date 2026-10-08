import { fireEvent, screen } from "@testing-library/react";

// Radix uses these browser APIs, which jsdom does not implement.
HTMLElement.prototype.scrollIntoView ??= () => {};
HTMLElement.prototype.hasPointerCapture ??= () => false;
HTMLElement.prototype.releasePointerCapture ??= () => {};

export async function selectOption(trigger: HTMLElement, option: string) {
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: option }));
}
