import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
} from "react";
import "./ElectricBorder.css";

type ElectricBorderProps = {
  children: ReactNode;
  color?: string;
  speed?: number;
  chaos?: number;
  thickness?: number;
  borderRadius?: number;
  className?: string;
  style?: CSSProperties;
};

export default function ElectricBorder({
  children,
  color = "#5227FF",
  speed = 1,
  chaos = 0.12,
  thickness = 2,
  borderRadius = 24,
  className,
  style,
}: ElectricBorderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const hoverStrengthRef = useRef(0);
  const hoverTargetRef = useRef(0);

  const random = useCallback((x: number) => {
    return (Math.sin(x * 12.9898) * 43758.5453) % 1;
  }, []);

  const noise2D = useCallback((x: number, y: number) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;

    const a = random(i + j * 57);
    const b = random(i + 1 + j * 57);
    const c = random(i + (j + 1) * 57);
    const d = random(i + 1 + (j + 1) * 57);

    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);

    return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
  }, [random]);

  const octavedNoise = useCallback((
    x: number,
    octaves: number,
    lacunarity: number,
    gain: number,
    baseAmplitude: number,
    baseFrequency: number,
    time: number,
    seed: number,
    baseFlatness: number,
  ) => {
    let y = 0;
    let amplitude = baseAmplitude;
    let frequency = baseFrequency;

    for (let i = 0; i < octaves; i += 1) {
      let octaveAmplitude = amplitude;
      if (i === 0) {
        octaveAmplitude *= baseFlatness;
      }
      y += octaveAmplitude * noise2D(frequency * x + seed * 100, time * frequency * 0.3);
      frequency *= lacunarity;
      amplitude *= gain;
    }

    return y;
  }, [noise2D]);

  const getCornerPoint = useCallback((
    centerX: number,
    centerY: number,
    radius: number,
    startAngle: number,
    arcLength: number,
    progress: number,
  ) => {
    const angle = startAngle + progress * arcLength;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  }, []);

  const getRoundedRectPoint = useCallback((
    t: number,
    left: number,
    top: number,
    width: number,
    height: number,
    radius: number,
  ) => {
    const straightWidth = width - 2 * radius;
    const straightHeight = height - 2 * radius;
    const cornerArc = (Math.PI * radius) / 2;
    const totalPerimeter = 2 * straightWidth + 2 * straightHeight + 4 * cornerArc;
    const distance = t * totalPerimeter;

    let accumulated = 0;

    if (distance <= accumulated + straightWidth) {
      const progress = (distance - accumulated) / straightWidth;
      return { x: left + radius + progress * straightWidth, y: top };
    }
    accumulated += straightWidth;

    if (distance <= accumulated + cornerArc) {
      const progress = (distance - accumulated) / cornerArc;
      return getCornerPoint(left + width - radius, top + radius, radius, -Math.PI / 2, Math.PI / 2, progress);
    }
    accumulated += cornerArc;

    if (distance <= accumulated + straightHeight) {
      const progress = (distance - accumulated) / straightHeight;
      return { x: left + width, y: top + radius + progress * straightHeight };
    }
    accumulated += straightHeight;

    if (distance <= accumulated + cornerArc) {
      const progress = (distance - accumulated) / cornerArc;
      return getCornerPoint(left + width - radius, top + height - radius, radius, 0, Math.PI / 2, progress);
    }
    accumulated += cornerArc;

    if (distance <= accumulated + straightWidth) {
      const progress = (distance - accumulated) / straightWidth;
      return { x: left + width - radius - progress * straightWidth, y: top + height };
    }
    accumulated += straightWidth;

    if (distance <= accumulated + cornerArc) {
      const progress = (distance - accumulated) / cornerArc;
      return getCornerPoint(left + radius, top + height - radius, radius, Math.PI / 2, Math.PI / 2, progress);
    }
    accumulated += cornerArc;

    if (distance <= accumulated + straightHeight) {
      const progress = (distance - accumulated) / straightHeight;
      return { x: left, y: top + height - radius - progress * straightHeight };
    }
    accumulated += straightHeight;

    const progress = (distance - accumulated) / cornerArc;
    return getCornerPoint(left + radius, top + radius, radius, Math.PI, Math.PI / 2, progress);
  }, [getCornerPoint]);

  const styleRadius = style?.borderRadius;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const setPointerCenter = () => {
      const rect = container.getBoundingClientRect();
      container.style.setProperty("--eb-pointer-x", `${rect.width / 2}px`);
      container.style.setProperty("--eb-pointer-y", `${rect.height / 2}px`);
    };

    const updatePointerPosition = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      container.style.setProperty("--eb-pointer-x", `${clientX - rect.left}px`);
      container.style.setProperty("--eb-pointer-y", `${clientY - rect.top}px`);
    };

    const handlePointerEnter = (event: PointerEvent) => {
      hoverTargetRef.current = 1;
      container.style.setProperty("--eb-pointer-opacity", "1");
      updatePointerPosition(event.clientX, event.clientY);
    };

    const handlePointerMove = (event: PointerEvent) => {
      updatePointerPosition(event.clientX, event.clientY);
    };

    const handlePointerLeave = () => {
      hoverTargetRef.current = 0;
      container.style.setProperty("--eb-pointer-opacity", "0");
    };

    setPointerCenter();
    container.addEventListener("pointerenter", handlePointerEnter);
    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      container.removeEventListener("pointerenter", handlePointerEnter);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;

    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const octaves = 10;
    const lacunarity = 1.6;
    const gain = 0.7;
    const amplitude = Math.max(chaos, 0);
    const frequency = 10;
    const baseFlatness = 0;
    const displacement = 60;
    const borderOffset = 60;

    let width = 0;
    let height = 0;
    let resolvedRadius = borderRadius;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      width = rect.width + borderOffset * 2;
      height = rect.height + borderOffset * 2;

      const computedRadius = window.getComputedStyle(container).borderTopLeftRadius;
      const parsedRadius = Number.parseFloat(computedRadius);
      resolvedRadius = Number.isFinite(parsedRadius) ? parsedRadius : borderRadius;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawElectricBorder = (currentTime: number) => {
      if (!canvasRef.current) return;

      if (lastFrameTimeRef.current === 0) {
        lastFrameTimeRef.current = currentTime;
      }

      const deltaTime = (currentTime - lastFrameTimeRef.current) / 1000;
      hoverStrengthRef.current += (hoverTargetRef.current - hoverStrengthRef.current) * 0.12;
      const hoverStrength = hoverStrengthRef.current;
      timeRef.current += deltaTime * speed * (1 + hoverStrength * 0.4);
      lastFrameTimeRef.current = currentTime;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.strokeStyle = color;
      ctx.lineWidth = thickness + hoverStrength * 0.6;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const scale = displacement * (1 + hoverStrength * 0.2);
      const left = borderOffset;
      const top = borderOffset;
      const borderWidth = width - 2 * borderOffset;
      const borderHeight = height - 2 * borderOffset;
      const maxRadius = Math.min(borderWidth, borderHeight) / 2;
      const radius = Math.min(resolvedRadius, maxRadius);
      const approximatePerimeter = 2 * (borderWidth + borderHeight) + 2 * Math.PI * radius;
      const sampleCount = Math.max(48, Math.floor(approximatePerimeter / 2));

      ctx.beginPath();

      for (let i = 0; i <= sampleCount; i += 1) {
        const progress = i / sampleCount;
        const point = getRoundedRectPoint(progress, left, top, borderWidth, borderHeight, radius);

        const xNoise = octavedNoise(
          progress * 8,
          octaves,
          lacunarity,
          gain,
          amplitude,
          frequency,
          timeRef.current,
          0,
          baseFlatness,
        );

        const yNoise = octavedNoise(
          progress * 8,
          octaves,
          lacunarity,
          gain,
          amplitude,
          frequency,
          timeRef.current,
          1,
          baseFlatness,
        );

        const displacedX = point.x + xNoise * scale;
        const displacedY = point.y + yNoise * scale;

        if (i === 0) {
          ctx.moveTo(displacedX, displacedY);
        } else {
          ctx.lineTo(displacedX, displacedY);
        }
      }

      ctx.closePath();
      ctx.stroke();
      animationRef.current = window.requestAnimationFrame(drawElectricBorder);
    };

    updateSize();
    lastFrameTimeRef.current = 0;
    animationRef.current = window.requestAnimationFrame(drawElectricBorder);

    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });
    resizeObserver.observe(container);

    return () => {
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
      }
      animationRef.current = null;
      lastFrameTimeRef.current = 0;
      resizeObserver.disconnect();
    };
  }, [
    borderRadius,
    chaos,
    color,
    getRoundedRectPoint,
    octavedNoise,
    speed,
    styleRadius,
    thickness,
  ]);

  const appliedBorderRadius = styleRadius ?? borderRadius;
  const cssVars = {
    "--electric-border-color": color,
    "--electric-border-thickness": `${thickness}px`,
    borderRadius: appliedBorderRadius,
  } as CSSProperties & Record<string, string | number>;

  return (
    <div
      ref={containerRef}
      className={`electric-border${className ? ` ${className}` : ""}`}
      style={{ ...cssVars, ...style }}
    >
      <div aria-hidden="true" className="eb-canvas-container">
        <canvas ref={canvasRef} className="eb-canvas" />
      </div>
      <div aria-hidden="true" className="eb-layers">
        <div className="eb-glow-1" />
        <div className="eb-glow-2" />
        <div className="eb-pointer-border" />
        <div className="eb-background-glow" />
        <div className="eb-pointer-glow" />
      </div>
      <div className="eb-content">
        <div aria-hidden="true" className="eb-content-spotlight" />
        {children}
      </div>
    </div>
  );
}
