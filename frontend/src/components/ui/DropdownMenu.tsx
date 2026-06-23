import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";

/* ─── Types ────────────────────────────────────────────────────── */

export interface DropdownMenuItem {
    label: string;
    icon?: LucideIcon;
    onClick?: () => void;
    disabled?: boolean;
    danger?: boolean;
}

export interface DropdownMenuDivider {
    type: "divider";
}

export type DropdownMenuEntry = DropdownMenuItem | DropdownMenuDivider;

type DropdownAlign = "start" | "end";
type DropdownSide = "bottom" | "top";

interface DropdownMenuProps {
    trigger: React.ReactElement;
    items: DropdownMenuEntry[];
    align?: DropdownAlign;
    side?: DropdownSide;
    className?: string;
}

/* ─── Helpers ──────────────────────────────────────────────────── */

function isDivider(entry: DropdownMenuEntry): entry is DropdownMenuDivider {
    return "type" in entry && entry.type === "divider";
}

/* ─── Component ────────────────────────────────────────────────── */

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
    trigger,
    items,
    align = "start",
    side = "bottom",
    className = "",
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const triggerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Position menu using fixed positioning (immune to overflow/scroll containers)
    useLayoutEffect(() => {
        if (!isOpen || !triggerRef.current || !menuRef.current) return;

        const trigger = triggerRef.current.getBoundingClientRect();
        const menu = menuRef.current;
        const menuRect = menu.getBoundingClientRect();

        // Vertical: prefer requested side, flip if overflows
        let top: number;
        if (side === "bottom") {
            top = trigger.bottom + 4;
            if (top + menuRect.height > window.innerHeight) {
                top = trigger.top - menuRect.height - 4;
            }
        } else {
            top = trigger.top - menuRect.height - 4;
            if (top < 0) {
                top = trigger.bottom + 4;
            }
        }

        // Horizontal: prefer requested align, flip if overflows
        let left: number;
        if (align === "end") {
            left = trigger.right - menuRect.width;
            if (left < 0) left = trigger.left;
        } else {
            left = trigger.left;
            if (left + menuRect.width > window.innerWidth) {
                left = trigger.right - menuRect.width;
            }
        }

        // Clamp to viewport
        top = Math.max(4, Math.min(top, window.innerHeight - menuRect.height - 4));
        left = Math.max(4, Math.min(left, window.innerWidth - menuRect.width - 4));

        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
    });

    // Click outside — check both trigger and menu
    useEffect(() => {
        if (!isOpen) return;
        const onClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                triggerRef.current && !triggerRef.current.contains(target) &&
                menuRef.current && !menuRef.current.contains(target)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, [isOpen]);

    // Close on scroll (but not when scrolling inside the menu itself)
    useEffect(() => {
        if (!isOpen) return;
        const onScroll = (e: Event) => {
            if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
            setIsOpen(false);
        };
        window.addEventListener("scroll", onScroll, true);
        return () => window.removeEventListener("scroll", onScroll, true);
    }, [isOpen]);

    // Reset focus index when menu opens/closes
    useEffect(() => {
        // Clear keyboard focus whenever the menu closes so it never reopens
        // with a stale highlighted item.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (!isOpen) setFocusedIndex(-1);
    }, [isOpen]);

    const actionableItems = items
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => !isDivider(item) && !(item as DropdownMenuItem).disabled);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (!isOpen) {
                if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setIsOpen(true);
                }
                return;
            }

            switch (e.key) {
                case "ArrowDown": {
                    e.preventDefault();
                    const currentActionIdx = actionableItems.findIndex(
                        ({ idx }) => idx === focusedIndex
                    );
                    const next =
                        currentActionIdx < actionableItems.length - 1
                            ? actionableItems[currentActionIdx + 1].idx
                            : actionableItems[0].idx;
                    setFocusedIndex(next);
                    break;
                }
                case "ArrowUp": {
                    e.preventDefault();
                    const currentActionIdx = actionableItems.findIndex(
                        ({ idx }) => idx === focusedIndex
                    );
                    const prev =
                        currentActionIdx > 0
                            ? actionableItems[currentActionIdx - 1].idx
                            : actionableItems[actionableItems.length - 1].idx;
                    setFocusedIndex(prev);
                    break;
                }
                case "Enter":
                case " ": {
                    e.preventDefault();
                    if (focusedIndex >= 0) {
                        const item = items[focusedIndex];
                        if (!isDivider(item) && !item.disabled && item.onClick) {
                            item.onClick();
                            setIsOpen(false);
                        }
                    }
                    break;
                }
                case "Escape":
                    e.preventDefault();
                    setIsOpen(false);
                    break;
            }
        },
        [isOpen, focusedIndex, items, actionableItems]
    );

    const handleItemClick = (item: DropdownMenuItem) => {
        if (item.disabled) return;
        item.onClick?.();
        setIsOpen(false);
    };

    const menuContent = isOpen
        ? createPortal(
              <div
                  ref={menuRef}
                  role="menu"
                  style={{ position: "fixed", top: 0, left: 0 }}
                  className={[
                      "z-[9999] min-w-[180px]",
                      "bg-zinc-800 border border-white/[0.08] rounded-lg shadow-xl",
                      "p-1",
                      className,
                  ]
                      .filter(Boolean)
                      .join(" ")}
              >
                  {items.map((entry, idx) => {
                      if (isDivider(entry)) {
                          return (
                              <div
                                  key={`divider-${idx}`}
                                  role="separator"
                                  className="my-1 border-t border-white/[0.06]"
                              />
                          );
                      }

                      const item = entry;
                      const Icon = item.icon;
                      const isFocused = idx === focusedIndex;

                      return (
                          <div
                              key={`${item.label}-${idx}`}
                              role="menuitem"
                              tabIndex={-1}
                              aria-disabled={item.disabled || undefined}
                              onClick={() => handleItemClick(item)}
                              onMouseEnter={() => setFocusedIndex(idx)}
                              className={[
                                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer",
                                  "transition-colors duration-150",
                                  item.disabled
                                      ? "opacity-40 cursor-not-allowed"
                                      : item.danger
                                        ? "text-red-400 hover:bg-red-500/10"
                                        : "text-zinc-300 hover:bg-white/[0.05] hover:text-zinc-50",
                                  isFocused && !item.disabled
                                      ? item.danger
                                          ? "bg-red-500/10"
                                          : "bg-white/[0.05] text-zinc-50"
                                      : "",
                              ]
                                  .filter(Boolean)
                                  .join(" ")}
                          >
                              {Icon && (
                                  <Icon
                                      size={14}
                                      className={[
                                          "shrink-0",
                                          item.danger ? "text-red-400" : "text-zinc-500",
                                      ].join(" ")}
                                  />
                              )}
                              <span className="truncate">{item.label}</span>
                          </div>
                      );
                  })}
              </div>,
              document.body
          )
        : null;

    return (
        <div
            ref={triggerRef}
            className="inline-flex"
            onKeyDown={handleKeyDown}
        >
            {/* Trigger */}
            {React.cloneElement(trigger, {
                onClick: (e: React.MouseEvent) => {
                    trigger.props.onClick?.(e);
                    setIsOpen((prev) => !prev);
                },
                "aria-haspopup": "menu" as const,
                "aria-expanded": isOpen,
            })}

            {/* Menu via portal */}
            {menuContent}
        </div>
    );
};

DropdownMenu.displayName = "DropdownMenu";
