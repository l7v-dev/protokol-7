/**
 * Set-of-Mark (SoM) Visual DOM Indexer.
 * Inspects visible and interactable DOM elements, injects numbered visual badges for screenshots,
 * and generates token-efficient semantic manifests for LLM reasoning.
 */

import { Page } from "playwright";

export interface IndexedElement {
  index: number;
  tag: string;
  type?: string;
  name?: string;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  text?: string;
  value?: string;
  href?: string;
  role?: string;
  selector: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface DOMIndexResult {
  elements: IndexedElement[];
  manifest: string;
  totalCount: number;
}

export class DOMIndexer {
  private static readonly BADGE_CONTAINER_ID = "agent-smith-som-container";

  /**
   * Evaluates the DOM inside the page, isolates interactable elements, and generates their metadata.
   */
  static async indexPage(page: Page): Promise<DOMIndexResult> {
    await page.evaluate("window.__name = (fn) => fn;").catch(() => {});
    const rawElements = await page.evaluate(
      (): Array<{
        index: number;
        tag: string;
        type?: string;
        name?: string;
        id?: string;
        placeholder?: string;
        ariaLabel?: string;
        text?: string;
        value?: string;
        href?: string;
        role?: string;
        selector: string;
        rect: { x: number; y: number; width: number; height: number };
      }> => {
        // Provide fallback for bundlers (such as esbuild/tsx) that inject __name helpers
        const __name = (target: unknown) => target;

        const candidates = Array.from(
          document.querySelectorAll(
            "button, a, input, select, textarea, [role='button'], [role='link'], [role='checkbox'], [role='menuitem'], [role='tab'], [contenteditable='true'], [tabindex]:not([tabindex='-1'])"
          )
        );

        function isVisible(el: Element): boolean {
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
            return false;
          }
          const rect = el.getBoundingClientRect();
          return rect.width > 2 && rect.height > 2;
        }

        function generateSelector(el: Element): string {
          if (el.id) return `#${el.id}`;
          const testId = el.getAttribute("data-testid");
          if (testId) return `[data-testid="${testId}"]`;
          const name = el.getAttribute("name");
          if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;

          // Generate hierarchical path
          const path: string[] = [];
          let curr: Element | null = el;
          while (curr && curr !== document.body && path.length < 4) {
            let segment = curr.tagName.toLowerCase();
            if (curr.className && typeof curr.className === "string") {
              const firstClass = curr.className.trim().split(/\s+/)[0];
              if (firstClass && typeof CSS !== "undefined" && typeof CSS.escape === "function") {
                segment += `.${CSS.escape(firstClass)}`;
              } else if (firstClass && !firstClass.includes(":") && !firstClass.includes("/")) {
                segment += `.${firstClass}`;
              }
            }
            path.unshift(segment);
            curr = curr.parentElement;
          }
          return path.join(" > ");
        }

        const visibleCandidates = candidates.filter(isVisible);
        const results: Array<{
          index: number;
          tag: string;
          type?: string;
          name?: string;
          id?: string;
          placeholder?: string;
          ariaLabel?: string;
          text?: string;
          value?: string;
          href?: string;
          role?: string;
          selector: string;
          rect: { x: number; y: number; width: number; height: number };
        }> = [];

        visibleCandidates.forEach((el, idx) => {
          const rect = el.getBoundingClientRect();
          const tag = el.tagName.toLowerCase();
          const type = el.getAttribute("type") || undefined;
          const name = el.getAttribute("name") || undefined;
          const id = el.id || undefined;
          const placeholder = el.getAttribute("placeholder") || undefined;
          const ariaLabel = el.getAttribute("aria-label") || undefined;
          const role = el.getAttribute("role") || undefined;
          const href = el.getAttribute("href") || undefined;
          const value = (el as HTMLInputElement).value || undefined;

          let rawText = el.textContent || "";
          if (tag === "input" && (type === "submit" || type === "button")) {
            rawText = value || "";
          }
          const text = rawText.trim().replace(/\s+/g, " ").slice(0, 80) || undefined;

          results.push({
            index: idx + 1,
            tag,
            type,
            name,
            id,
            placeholder,
            ariaLabel,
            text,
            value,
            href,
            role,
            selector: generateSelector(el),
            rect: {
              x: Math.round(rect.left + window.scrollX),
              y: Math.round(rect.top + window.scrollY),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
          });
        });

        return results;
      }
    );

    // Build concise, token-efficient semantic manifest
    const manifestLines: string[] = [];
    manifestLines.push(`Found ${rawElements.length} interactable elements:`);

    for (const item of rawElements) {
      const attrs: string[] = [];
      if (item.type) attrs.push(`type="${item.type}"`);
      if (item.name) attrs.push(`name="${item.name}"`);
      if (item.id) attrs.push(`id="${item.id}"`);
      if (item.role) attrs.push(`role="${item.role}"`);
      if (item.placeholder) attrs.push(`placeholder="${item.placeholder}"`);
      if (item.ariaLabel) attrs.push(`aria-label="${item.ariaLabel}"`);
      if (item.href) attrs.push(`href="${item.href}"`);

      const attrStr = attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
      const textStr = item.text ? ` ${item.text}` : "";
      manifestLines.push(`[${item.index}] <${item.tag}${attrStr}>${textStr}`);
    }

    return {
      elements: rawElements,
      manifest: manifestLines.join("\n"),
      totalCount: rawElements.length,
    };
  }

  /**
   * Injects numbered cyber-mint Set-of-Mark visual badges onto the DOM for screenshot capturing.
   */
  static async injectBadges(page: Page, elements: IndexedElement[]): Promise<void> {
    await page.evaluate(
      ({ containerId, badges }) => {
        let container = document.getElementById(containerId);
        if (container) {
          container.remove();
        }

        container = document.createElement("div");
        container.id = containerId;
        container.style.position = "absolute";
        container.style.top = "0";
        container.style.left = "0";
        container.style.width = "100%";
        container.style.height = "100%";
        container.style.pointerEvents = "none";
        container.style.zIndex = "2147483640";

        badges.forEach((item) => {
          const badge = document.createElement("div");
          badge.textContent = String(item.index);
          badge.style.position = "absolute";
          badge.style.left = `${item.rect.x}px`;
          badge.style.top = `${item.rect.y}px`;
          badge.style.background = "#10B981"; // cyber mint
          badge.style.color = "#000000";
          badge.style.fontFamily = "monospace, sans-serif";
          badge.style.fontSize = "11px";
          badge.style.fontWeight = "bold";
          badge.style.padding = "1px 4px";
          badge.style.borderRadius = "3px";
          badge.style.border = "1px solid #000000";
          badge.style.boxShadow = "0 0 6px rgba(16, 185, 129, 0.85)";
          badge.style.transform = "translate(-2px, -2px)";
          badge.style.whiteSpace = "nowrap";
          badge.style.pointerEvents = "none";
          container!.appendChild(badge);
        });

        document.body.appendChild(container);
      },
      { containerId: this.BADGE_CONTAINER_ID, badges: elements }
    );
  }

  /**
   * Removes visual Set-of-Mark badges from the DOM.
   */
  static async removeBadges(page: Page): Promise<void> {
    await page.evaluate((containerId) => {
      const container = document.getElementById(containerId);
      if (container) {
        container.remove();
      }
    }, this.BADGE_CONTAINER_ID);
  }
}
