import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Key,
  type ReactNode,
} from "react";
import { gsap } from "gsap";
import "./MagicBento.css";

const DEFAULT_PARTICLE_COUNT = 12;
const DEFAULT_SPOTLIGHT_RADIUS = 300;
const DEFAULT_GLOW_COLOR = "132, 0, 255";
const MOBILE_BREAKPOINT = 768;

type MagicBentoProps<T> = {
  items: readonly T[];
  getItemKey: (item: T, index: number) => Key;
  renderItem: (item: T, index: number) => ReactNode;
  onItemClick?: (item: T, index: number) => void;
  isItemActive?: (item: T, index: number) => boolean;
  getItemAriaLabel?: (item: T, index: number) => string | undefined;
  getItemStyle?: (item: T, index: number) => CSSProperties | undefined;
  className?: string;
  itemClassName?: string;
  textAutoHide?: boolean;
  enableStars?: boolean;
  enableSpotlight?: boolean;
  enableBorderGlow?: boolean;
  disableAnimations?: boolean;
  spotlightRadius?: number;
  particleCount?: number;
  enableTilt?: boolean;
  glowColor?: string;
  clickEffect?: boolean;
  enableMagnetism?: boolean;
};

type MagicBentoItemProps = {
  active: boolean;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  onClick?: () => void;
  style?: CSSProperties;
  textAutoHide: boolean;
  enableStars: boolean;
  enableBorderGlow: boolean;
  animationsDisabled: boolean;
  particleCount: number;
  glowColor: string;
  enableTilt: boolean;
  clickEffect: boolean;
  enableMagnetism: boolean;
};

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function createParticleElement(x: number, y: number, color: string) {
  const element = document.createElement("div");
  element.className = "magic-bento-particle";
  element.style.cssText = `
    position: absolute;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: rgba(${color}, 1);
    box-shadow: 0 0 6px rgba(${color}, 0.6);
    pointer-events: none;
    z-index: 100;
    left: ${x}px;
    top: ${y}px;
  `;
  return element;
}

function calculateSpotlightValues(radius: number) {
  return {
    proximity: radius * 0.5,
    fadeDistance: radius * 0.75,
  };
}

function updateCardGlowProperties(
  card: HTMLElement,
  mouseX: number,
  mouseY: number,
  glowIntensity: number,
  radius: number,
) {
  const rect = card.getBoundingClientRect();
  const relativeX = ((mouseX - rect.left) / rect.width) * 100;
  const relativeY = ((mouseY - rect.top) / rect.height) * 100;

  card.style.setProperty("--magic-bento-glow-x", `${relativeX}%`);
  card.style.setProperty("--magic-bento-glow-y", `${relativeY}%`);
  card.style.setProperty("--magic-bento-glow-intensity", glowIntensity.toString());
  card.style.setProperty("--magic-bento-glow-radius", `${radius}px`);
}

function useMagicBentoMotionState(disableAnimations: boolean) {
  const [isMobile, setIsMobile] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setPrefersReducedMotion(motionMedia.matches);

    checkMobile();
    updateMotionPreference();

    window.addEventListener("resize", checkMobile);
    motionMedia.addEventListener("change", updateMotionPreference);

    return () => {
      window.removeEventListener("resize", checkMobile);
      motionMedia.removeEventListener("change", updateMotionPreference);
    };
  }, []);

  return disableAnimations || isMobile || prefersReducedMotion;
}

function MagicBentoItem({
  active,
  children,
  className,
  ariaLabel,
  onClick,
  style,
  textAutoHide,
  enableStars,
  enableBorderGlow,
  animationsDisabled,
  particleCount,
  glowColor,
  enableTilt,
  clickEffect,
  enableMagnetism,
}: MagicBentoItemProps) {
  const itemRef = useRef<HTMLButtonElement | null>(null);
  const particlesRef = useRef<HTMLDivElement[]>([]);
  const particleBlueprintsRef = useRef<HTMLDivElement[]>([]);
  const timeoutsRef = useRef<number[]>([]);
  const hoveredRef = useRef(false);
  const baseRectRef = useRef<DOMRect | null>(null);
  const moveFrameRef = useRef<number>(0);
  const pointerRef = useRef({ clientX: 0, clientY: 0 });

  useEffect(() => {
    const element = itemRef.current;
    if (!element || animationsDisabled) {
      return;
    }

    const setTranslateX = enableMagnetism
      ? gsap.quickTo(element, "x", {
          duration: 0.18,
          ease: "power2.out",
        })
      : null;
    const setTranslateY = enableMagnetism
      ? gsap.quickTo(element, "y", {
          duration: 0.18,
          ease: "power2.out",
        })
      : null;
    const setRotateX = enableTilt
      ? gsap.quickTo(element, "rotationX", {
          duration: 0.16,
          ease: "power2.out",
        })
      : null;
    const setRotateY = enableTilt
      ? gsap.quickTo(element, "rotationY", {
          duration: 0.16,
          ease: "power2.out",
        })
      : null;

    gsap.set(element, {
      transformPerspective: 1200,
      transformOrigin: "center center",
      force3D: true,
    });

    const initializeParticles = () => {
      if (particleBlueprintsRef.current.length > 0) {
        return;
      }

      const { width, height } = element.getBoundingClientRect();
      const effectiveParticleCount = Math.min(particleCount, 6);
      particleBlueprintsRef.current = Array.from({ length: effectiveParticleCount }, () =>
        createParticleElement(Math.random() * width, Math.random() * height, glowColor),
      );
    };

    const clearAllParticles = () => {
      for (const timeoutId of timeoutsRef.current) {
        window.clearTimeout(timeoutId);
      }
      timeoutsRef.current = [];

      for (const particle of particlesRef.current) {
        gsap.killTweensOf(particle);
        gsap.to(particle, {
          scale: 0,
          opacity: 0,
          duration: 0.2,
          ease: "power2.out",
          onComplete: () => {
            particle.remove();
          },
        });
      }

      particlesRef.current = [];
    };

    const animateParticles = () => {
      if (!enableStars || !hoveredRef.current) {
        return;
      }

      initializeParticles();

      particleBlueprintsRef.current.forEach((particle, index) => {
        const timeoutId = window.setTimeout(() => {
          if (!hoveredRef.current) {
            return;
          }

          const clone = particle.cloneNode(true) as HTMLDivElement;
          element.appendChild(clone);
          particlesRef.current.push(clone);

          gsap.fromTo(
            clone,
            { scale: 0, opacity: 0 },
            {
              scale: 1,
              opacity: 1,
              duration: 0.22,
              ease: "power2.out",
            },
          );

          gsap.to(clone, {
            x: (Math.random() - 0.5) * 72,
            y: (Math.random() - 0.5) * 72,
            rotation: Math.random() * 360,
            duration: 2.2 + Math.random() * 1.2,
            ease: "none",
            repeat: -1,
            yoyo: true,
          });

          gsap.to(clone, {
            opacity: 0.2,
            duration: 1.2,
            ease: "power2.inOut",
            repeat: -1,
            yoyo: true,
          });
        }, index * 70);

        timeoutsRef.current.push(timeoutId);
      });
    };

    const refreshBaseRect = () => {
      baseRectRef.current = element.getBoundingClientRect();
    };

    const resetTransform = () => {
      if (moveFrameRef.current) {
        window.cancelAnimationFrame(moveFrameRef.current);
        moveFrameRef.current = 0;
      }

      if (setRotateX && setRotateY) {
        setRotateX(0);
        setRotateY(0);
      }

      if (setTranslateX && setTranslateY) {
        setTranslateX(0);
        setTranslateY(0);
      }
    };

    const flushPointerMotion = () => {
      moveFrameRef.current = 0;

      if (!hoveredRef.current || (!setRotateX && !setTranslateX)) {
        return;
      }

      const rect = baseRectRef.current;
      if (!rect || rect.width === 0 || rect.height === 0) {
        return;
      }

      const x = pointerRef.current.clientX - rect.left;
      const y = pointerRef.current.clientY - rect.top;
      const normalizedX = clamp(x / rect.width, 0, 1);
      const normalizedY = clamp(y / rect.height, 0, 1);
      const offsetX = normalizedX - 0.5;
      const offsetY = normalizedY - 0.5;

      if (setRotateX && setRotateY) {
        setRotateX(offsetY * -10);
        setRotateY(offsetX * 10);
      }

      if (setTranslateX && setTranslateY) {
        setTranslateX(offsetX * 12);
        setTranslateY(offsetY * 12);
      }
    };

    const schedulePointerMotion = () => {
      if (moveFrameRef.current) {
        return;
      }

      moveFrameRef.current = window.requestAnimationFrame(flushPointerMotion);
    };

    const handlePointerEnter = () => {
      hoveredRef.current = true;
      refreshBaseRect();
      animateParticles();
    };

    const handlePointerLeave = () => {
      hoveredRef.current = false;
      clearAllParticles();
      resetTransform();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!enableTilt && !enableMagnetism) {
        return;
      }

      pointerRef.current.clientX = event.clientX;
      pointerRef.current.clientY = event.clientY;
      schedulePointerMotion();
    };

    const handleClick = (event: MouseEvent) => {
      if (!clickEffect) {
        return;
      }

      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const maxDistance = Math.max(
        Math.hypot(x, y),
        Math.hypot(x - rect.width, y),
        Math.hypot(x, y - rect.height),
        Math.hypot(x - rect.width, y - rect.height),
      );

      const ripple = document.createElement("div");
      ripple.className = "magic-bento-ripple";
      ripple.style.cssText = `
        position: absolute;
        width: ${maxDistance * 2}px;
        height: ${maxDistance * 2}px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(${glowColor}, 0.34) 0%, rgba(${glowColor}, 0.16) 32%, transparent 72%);
        left: ${x - maxDistance}px;
        top: ${y - maxDistance}px;
        pointer-events: none;
        z-index: 1000;
      `;

      element.appendChild(ripple);

      gsap.fromTo(
        ripple,
        {
          scale: 0,
          opacity: 1,
        },
        {
          scale: 1,
          opacity: 0,
          duration: 0.8,
          ease: "power2.out",
          onComplete: () => ripple.remove(),
        },
      );
    };

    window.addEventListener("resize", refreshBaseRect);
    element.addEventListener("pointerenter", handlePointerEnter);
    element.addEventListener("pointerleave", handlePointerLeave);
    element.addEventListener("pointermove", handlePointerMove, { passive: true });
    element.addEventListener("click", handleClick);

    return () => {
      hoveredRef.current = false;
      window.removeEventListener("resize", refreshBaseRect);

      element.removeEventListener("pointerenter", handlePointerEnter);
      element.removeEventListener("pointerleave", handlePointerLeave);
      element.removeEventListener("pointermove", handlePointerMove);
      element.removeEventListener("click", handleClick);

      if (moveFrameRef.current) {
        window.cancelAnimationFrame(moveFrameRef.current);
        moveFrameRef.current = 0;
      }

      gsap.killTweensOf(element);
      clearAllParticles();
      gsap.set(element, { clearProps: "transform" });
      baseRectRef.current = null;
      particleBlueprintsRef.current = [];
    };
  }, [
    animationsDisabled,
    clickEffect,
    enableMagnetism,
    enableStars,
    enableTilt,
    glowColor,
    particleCount,
  ]);

  const itemClassNames = joinClassNames(
    "magic-bento-item",
    textAutoHide && "magic-bento-item--text-autohide",
    enableBorderGlow && "magic-bento-item--border-glow",
    active && "is-active",
    className,
  );

  const mergedStyle = {
    ...style,
    "--magic-bento-glow-rgb": glowColor,
  } as CSSProperties;

  return (
    <button
      ref={itemRef}
      type="button"
      data-magic-bento-item="true"
      aria-label={ariaLabel}
      aria-pressed={active}
      className={itemClassNames}
      style={mergedStyle}
      onClick={onClick}
    >
      <span className="magic-bento-item__inner">{children}</span>
    </button>
  );
}

type GlobalSpotlightProps = {
  gridRef: React.RefObject<HTMLDivElement>;
  itemCount: number;
  animationsDisabled: boolean;
  enabled: boolean;
  spotlightRadius: number;
  glowColor: string;
};

function GlobalSpotlight({
  gridRef,
  itemCount,
  animationsDisabled,
  enabled,
  spotlightRadius,
  glowColor,
}: GlobalSpotlightProps) {
  const spotlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (animationsDisabled || !enabled || !gridRef.current) {
      return;
    }

    const grid = gridRef.current;
    const spotlight = document.createElement("div");
    spotlight.className = "magic-bento-global-spotlight";
    spotlight.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      width: 560px;
      height: 560px;
      border-radius: 50%;
      pointer-events: none;
      background: radial-gradient(circle,
        rgba(${glowColor}, 0.1) 0%,
        rgba(${glowColor}, 0.05) 18%,
        rgba(${glowColor}, 0.024) 34%,
        rgba(${glowColor}, 0.01) 50%,
        transparent 72%
      );
      z-index: 1;
      opacity: 0;
    `;

    grid.appendChild(spotlight);
    spotlightRef.current = spotlight;
    gsap.set(spotlight, {
      xPercent: -50,
      yPercent: -50,
      force3D: true,
    });

    const setSpotlightX = gsap.quickTo(spotlight, "x", {
      duration: 0.14,
      ease: "power2.out",
    });
    const setSpotlightY = gsap.quickTo(spotlight, "y", {
      duration: 0.14,
      ease: "power2.out",
    });
    const setSpotlightOpacity = gsap.quickTo(spotlight, "opacity", {
      duration: 0.18,
      ease: "power2.out",
    });

    let frameId = 0;
    let lastX = 0;
    let lastY = 0;
    let gridBounds = grid.getBoundingClientRect();
    let cards = Array.from(grid.querySelectorAll<HTMLElement>(".magic-bento-item"));
    let activeCards = new Set<HTMLElement>();

    const refreshLayoutMetrics = () => {
      gridBounds = grid.getBoundingClientRect();
      cards = Array.from(grid.querySelectorAll<HTMLElement>(".magic-bento-item"));
    };

    const clearGlow = () => {
      for (const card of activeCards) {
        card.style.setProperty("--magic-bento-glow-intensity", "0");
      }
      activeCards.clear();
      setSpotlightOpacity(0);
    };

    const updateSpotlight = () => {
      frameId = 0;

      if (!spotlightRef.current) {
        return;
      }

      const mouseInside =
        lastX >= gridBounds.left &&
        lastX <= gridBounds.right &&
        lastY >= gridBounds.top &&
        lastY <= gridBounds.bottom;

      if (!mouseInside) {
        clearGlow();
        return;
      }

      const localX = lastX - gridBounds.left;
      const localY = lastY - gridBounds.top;
      const { proximity, fadeDistance } = calculateSpotlightValues(spotlightRadius);
      let minDistance = Number.POSITIVE_INFINITY;
      const nextActiveCards = new Set<HTMLElement>();

      for (const card of cards) {
        const rect = card.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const distance =
          Math.hypot(lastX - centerX, lastY - centerY) -
          Math.max(rect.width, rect.height) / 2;
        const effectiveDistance = Math.max(0, distance);

        minDistance = Math.min(minDistance, effectiveDistance);

        let glowIntensity = 0;
        if (effectiveDistance <= proximity) {
          glowIntensity = 1;
        } else if (effectiveDistance <= fadeDistance) {
          glowIntensity =
            (fadeDistance - effectiveDistance) / (fadeDistance - proximity);
        }

        if (glowIntensity > 0.01) {
          nextActiveCards.add(card);
          updateCardGlowProperties(card, lastX, lastY, glowIntensity, spotlightRadius);
        } else if (activeCards.has(card)) {
          card.style.setProperty("--magic-bento-glow-intensity", "0");
        }
      }

      for (const card of activeCards) {
        if (!nextActiveCards.has(card)) {
          card.style.setProperty("--magic-bento-glow-intensity", "0");
        }
      }

      activeCards = nextActiveCards;
      setSpotlightX(localX);
      setSpotlightY(localY);

      const targetOpacity =
        minDistance <= proximity
          ? 0.72
          : minDistance <= fadeDistance
            ? ((fadeDistance - minDistance) / (fadeDistance - proximity)) * 0.72
            : 0;

      setSpotlightOpacity(targetOpacity);
    };

    const scheduleSpotlightUpdate = () => {
      if (frameId) {
        return;
      }

      frameId = window.requestAnimationFrame(updateSpotlight);
    };

    const handlePointerEnter = () => {
      refreshLayoutMetrics();
    };

    const handlePointerMove = (event: PointerEvent) => {
      lastX = event.clientX;
      lastY = event.clientY;
      scheduleSpotlightUpdate();
    };

    const handlePointerLeave = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
      }

      clearGlow();
    };

    window.addEventListener("resize", refreshLayoutMetrics);
    window.addEventListener("scroll", refreshLayoutMetrics, true);
    grid.addEventListener("pointerenter", handlePointerEnter);
    grid.addEventListener("pointermove", handlePointerMove, { passive: true });
    grid.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }

      window.removeEventListener("resize", refreshLayoutMetrics);
      window.removeEventListener("scroll", refreshLayoutMetrics, true);
      grid.removeEventListener("pointerenter", handlePointerEnter);
      grid.removeEventListener("pointermove", handlePointerMove);
      grid.removeEventListener("pointerleave", handlePointerLeave);

      clearGlow();
      gsap.killTweensOf(spotlight);
      spotlightRef.current?.remove();
      spotlightRef.current = null;
    };
  }, [animationsDisabled, enabled, glowColor, gridRef, itemCount, spotlightRadius]);

  return null;
}

export default function MagicBento<T>({
  items,
  getItemKey,
  renderItem,
  onItemClick,
  isItemActive,
  getItemAriaLabel,
  getItemStyle,
  className,
  itemClassName,
  textAutoHide = true,
  enableStars = true,
  enableSpotlight = true,
  enableBorderGlow = true,
  disableAnimations = false,
  spotlightRadius = DEFAULT_SPOTLIGHT_RADIUS,
  particleCount = DEFAULT_PARTICLE_COUNT,
  enableTilt = false,
  glowColor = DEFAULT_GLOW_COLOR,
  clickEffect = true,
  enableMagnetism = true,
}: MagicBentoProps<T>) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const animationsDisabled = useMagicBentoMotionState(disableAnimations);

  return (
    <>
      {enableSpotlight ? (
        <GlobalSpotlight
          gridRef={gridRef}
          itemCount={items.length}
          animationsDisabled={animationsDisabled}
          enabled={enableSpotlight}
          spotlightRadius={spotlightRadius}
          glowColor={glowColor}
        />
      ) : null}

      <div
        ref={gridRef}
        className={joinClassNames("magic-bento-grid", "magic-bento-section", className)}
      >
        {items.map((item, index) => (
          <MagicBentoItem
            key={getItemKey(item, index)}
            active={Boolean(isItemActive?.(item, index))}
            ariaLabel={getItemAriaLabel?.(item, index)}
            className={itemClassName}
            onClick={onItemClick ? () => onItemClick(item, index) : undefined}
            style={getItemStyle?.(item, index)}
            textAutoHide={textAutoHide}
            enableStars={enableStars}
            enableBorderGlow={enableBorderGlow}
            animationsDisabled={animationsDisabled}
            particleCount={particleCount}
            glowColor={glowColor}
            enableTilt={enableTilt}
            clickEffect={clickEffect}
            enableMagnetism={enableMagnetism}
          >
            {renderItem(item, index)}
          </MagicBentoItem>
        ))}
      </div>
    </>
  );
}
