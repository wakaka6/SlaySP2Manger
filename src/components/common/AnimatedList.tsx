import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Key,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  UIEvent as ReactUIEvent,
} from "react";
import { motion, useInView } from "motion/react";
import "./AnimatedList.css";

type AnimatedItemProps = {
  children: ReactNode;
  delay?: number;
  index: number;
  selected: boolean;
  className?: string;
  onMouseEnter: () => void;
  onClick: () => void;
};

function AnimatedItem({
  children,
  delay = 0,
  index,
  selected,
  className = "",
  onMouseEnter,
  onClick,
}: AnimatedItemProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { amount: 0.45, once: false });

  return (
    <motion.div
      ref={ref}
      data-index={index}
      className={`animated-list__item-shell${selected ? " is-selected" : ""}${className ? ` ${className}` : ""}`}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      initial={{ y: 14, scale: 0.985, opacity: 0 }}
      animate={inView ? { y: 0, scale: 1, opacity: 1 } : { y: 14, scale: 0.985, opacity: 0 }}
      transition={{
        duration: 0.22,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}

export type AnimatedListProps<T> = {
  items?: T[];
  onItemSelect?: (item: T, index: number) => void;
  showGradients?: boolean;
  enableArrowNavigation?: boolean;
  className?: string;
  listClassName?: string;
  itemClassName?: string;
  displayScrollbar?: boolean;
  initialSelectedIndex?: number;
  selectedIndex?: number;
  renderItem?: (item: T, index: number, selected: boolean) => ReactNode;
  getItemKey?: (item: T, index: number) => Key;
  ariaLabel?: string;
};

function AnimatedList<T>({
  items = [] as T[],
  onItemSelect,
  showGradients = true,
  enableArrowNavigation = true,
  className = "",
  listClassName = "",
  itemClassName = "",
  displayScrollbar = true,
  initialSelectedIndex = -1,
  selectedIndex: controlledSelectedIndex,
  renderItem,
  getItemKey,
  ariaLabel,
}: AnimatedListProps<T>) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex);
  const [keyboardNav, setKeyboardNav] = useState(false);
  const [topGradientOpacity, setTopGradientOpacity] = useState(0);
  const [bottomGradientOpacity, setBottomGradientOpacity] = useState(1);
  const isControlled = typeof controlledSelectedIndex === "number";

  const updateGradientState = useCallback((element: HTMLDivElement | null) => {
    if (!element) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = element;
    setTopGradientOpacity(Math.min(scrollTop / 48, 1));
    const bottomDistance = scrollHeight - (scrollTop + clientHeight);
    setBottomGradientOpacity(scrollHeight <= clientHeight ? 0 : Math.min(bottomDistance / 56, 1));
  }, []);

  useEffect(() => {
    if (typeof controlledSelectedIndex === "number") {
      setSelectedIndex(controlledSelectedIndex);
    }
  }, [controlledSelectedIndex]);

  useEffect(() => {
    updateGradientState(listRef.current);
  }, [items.length, updateGradientState]);

  useEffect(() => {
    const element = listRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => updateGradientState(element));
    observer.observe(element);
    return () => observer.disconnect();
  }, [updateGradientState]);

  const handleItemMouseEnter = useCallback(
    (index: number) => {
      if (!isControlled) {
        setSelectedIndex(index);
      }
    },
    [isControlled],
  );

  const handleItemClick = useCallback(
    (item: T, index: number) => {
      setSelectedIndex(index);
      listRef.current?.focus({ preventScroll: true });
      onItemSelect?.(item, index);
    },
    [onItemSelect],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!enableArrowNavigation || items.length === 0) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setKeyboardNav(true);
        setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setKeyboardNav(true);
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (event.key === "Enter") {
        if (selectedIndex >= 0 && selectedIndex < items.length) {
          event.preventDefault();
          onItemSelect?.(items[selectedIndex], selectedIndex);
        }
      }
    },
    [enableArrowNavigation, items, onItemSelect, selectedIndex],
  );

  const handleScroll = useCallback((event: ReactUIEvent<HTMLDivElement>) => {
    updateGradientState(event.currentTarget);
  }, [updateGradientState]);

  useEffect(() => {
    if (!keyboardNav || selectedIndex < 0 || !listRef.current) {
      return;
    }

    const container = listRef.current;
    const selectedItem = container.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    if (selectedItem) {
      const extraMargin = 40;
      const containerScrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;
      const itemTop = selectedItem.offsetTop;
      const itemBottom = itemTop + selectedItem.offsetHeight;

      if (itemTop < containerScrollTop + extraMargin) {
        container.scrollTo({ top: itemTop - extraMargin, behavior: "smooth" });
      } else if (itemBottom > containerScrollTop + containerHeight - extraMargin) {
        container.scrollTo({
          top: itemBottom - containerHeight + extraMargin,
          behavior: "smooth",
        });
      }
    }

    setKeyboardNav(false);
  }, [keyboardNav, selectedIndex]);

  return (
    <div className={`animated-list${className ? ` ${className}` : ""}`}>
      <div
        ref={listRef}
        className={`animated-list__scroll${displayScrollbar ? "" : " no-scrollbar"}${listClassName ? ` ${listClassName}` : ""}`}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        tabIndex={enableArrowNavigation ? 0 : -1}
        aria-label={ariaLabel}
      >
        {items.map((item, index) => {
          const selected = selectedIndex === index;
          return (
            <AnimatedItem
              key={getItemKey ? getItemKey(item, index) : index}
              delay={Math.min(index * 0.015, 0.12)}
              index={index}
              selected={selected}
              onMouseEnter={() => handleItemMouseEnter(index)}
              onClick={() => handleItemClick(item, index)}
            >
              {renderItem ? (
                renderItem(item, index, selected)
              ) : (
                <div className={`animated-list__item${selected ? " is-selected" : ""}${itemClassName ? ` ${itemClassName}` : ""}`}>
                  <p className="animated-list__item-text">{String(item)}</p>
                </div>
              )}
            </AnimatedItem>
          );
        })}
      </div>

      {showGradients ? (
        <>
          <div className="animated-list__gradient animated-list__gradient--top" style={{ opacity: topGradientOpacity }}></div>
          <div className="animated-list__gradient animated-list__gradient--bottom" style={{ opacity: bottomGradientOpacity }}></div>
        </>
      ) : null}
    </div>
  );
}

export default AnimatedList;
