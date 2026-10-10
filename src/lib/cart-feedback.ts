// Tells the places that add things to the cart whether the "added to cart" sheet is
// showing the confirmation. If it is, they skip their own toast (no double message);
// if the motion layer is off or not loaded yet, they keep showing the toast as before.
let active = false;

export function setCartFeedbackActive(on: boolean): void {
  active = on;
}

export function cartFeedbackActive(): boolean {
  return active;
}
