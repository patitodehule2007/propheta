/**
 * Press feedback for every `.ui-press` / `.ui-dim` element, via event delegation.
 * Port of the better-design interaction kit: size-aware compression depth, a bloom
 * from the press point, a minimum visible press for quick taps, and keyboard press.
 * Purely visual — it never delays or blocks the element's own action.
 */

const PRESSABLE_SELECTOR = ".ui-press, .ui-dim";
const MIN_PRESS_MS = 90;
const PRESS_DEPTH_PX = 8;
const MIN_PRESS_SCALE = 0.9;
const MAX_PRESS_SCALE = 0.985;
const PRESSED_ATTRIBUTE = "data-pressed";
const PRIMARY_MOUSE_BUTTON = 0;

const pressedAt = new WeakMap<HTMLElement, number>();
const releaseTimers = new WeakMap<HTMLElement, number>();

function isDisabled(element: HTMLElement): boolean {
    return element.matches(":disabled") || element.getAttribute("aria-disabled") === "true";
}

function findPressable(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const element = target.closest(PRESSABLE_SELECTOR);
    return element instanceof HTMLElement ? element : null;
}

function computePressScale(element: HTMLElement): string {
    const rect = element.getBoundingClientRect();
    const scale = 1 - PRESS_DEPTH_PX / (rect.width + rect.height);
    return Math.min(MAX_PRESS_SCALE, Math.max(MIN_PRESS_SCALE, scale)).toFixed(4);
}

function pressOn(element: HTMLElement, clientX?: number, clientY?: number): void {
    if (isDisabled(element)) return;
    const rect = element.getBoundingClientRect();
    const hasPoint = clientX !== undefined && clientY !== undefined && rect.width > 0 && rect.height > 0;
    const pointX = hasPoint ? `${(((clientX - rect.left) / rect.width) * 100).toFixed(1)}%` : "50%";
    const pointY = hasPoint ? `${(((clientY - rect.top) / rect.height) * 100).toFixed(1)}%` : "50%";

    element.style.setProperty("--ui-press-scale", computePressScale(element));
    element.style.setProperty("--ui-px", pointX);
    element.style.setProperty("--ui-py", pointY);
    pressedAt.set(element, performance.now());
    window.clearTimeout(releaseTimers.get(element));
    element.setAttribute(PRESSED_ATTRIBUTE, "");
}

function pressOff(element: HTMLElement | null): void {
    if (element === null || !element.hasAttribute(PRESSED_ATTRIBUTE)) return;
    const heldMs = performance.now() - (pressedAt.get(element) ?? 0);
    const waitMs = Math.max(0, MIN_PRESS_MS - heldMs);
    window.clearTimeout(releaseTimers.get(element));
    releaseTimers.set(
        element,
        window.setTimeout(() => element.removeAttribute(PRESSED_ATTRIBUTE), waitMs)
    );
}

/**
 * Installs delegated press listeners on the document.
 *
 * @returns A cleanup function that removes every listener.
 */
export function installPressFeedback(): () => void {
    let activeElement: HTMLElement | null = null;

    function handlePointerDown(event: PointerEvent): void {
        if (event.pointerType === "mouse" && event.button !== PRIMARY_MOUSE_BUTTON) return;
        activeElement = findPressable(event.target);
        if (activeElement !== null) pressOn(activeElement, event.clientX, event.clientY);
    }

    function handlePointerUp(): void {
        pressOff(activeElement);
        activeElement = null;
    }

    function handleKey(event: KeyboardEvent): void {
        if (event.repeat || (event.key !== " " && event.key !== "Enter")) return;
        const element = findPressable(event.target);
        if (element === null) return;
        if (event.type === "keydown") pressOn(element);
        else pressOff(element);
    }

    function handleFocusOut(event: FocusEvent): void {
        pressOff(findPressable(event.target));
    }

    document.addEventListener("pointerdown", handlePointerDown, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    window.addEventListener("pointercancel", handlePointerUp, { passive: true });
    document.addEventListener("keydown", handleKey);
    document.addEventListener("keyup", handleKey);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
        document.removeEventListener("pointerdown", handlePointerDown);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
        document.removeEventListener("keydown", handleKey);
        document.removeEventListener("keyup", handleKey);
        document.removeEventListener("focusout", handleFocusOut);
    };
}
