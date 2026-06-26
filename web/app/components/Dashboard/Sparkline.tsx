import React, { useId } from "react";

interface SparklineProps {
  data: number[];
  maxPoints?: number;
  minVal?: number;
  maxVal?: number;
}

export default function Sparkline({ data, maxPoints = 20, minVal, maxVal }: SparklineProps) {
  const gradientId = useId();
  // If we don't have enough data points, pad with the first data point or zeros
  const points = [...data];
  while (points.length < maxPoints) {
    points.unshift(points[0] || 0);
  }

  // Slice to keep only the max points
  const displayPoints = points.slice(-maxPoints);

  const width = 100;
  const height = 40;
  const padding = 2;

  const resolvedMin = minVal !== undefined ? minVal : Math.min(...displayPoints, 0);
  const resolvedMax = maxVal !== undefined ? maxVal : Math.max(...displayPoints, 1);
  
  const pointsRange = resolvedMax - resolvedMin;

  const coordinates = displayPoints.map((val, index) => {
    const x = (index / (maxPoints - 1)) * (width - padding * 2) + padding;
    // Map value to Y coordinate (inverted because Y=0 is the top in SVG)
    const ratio = pointsRange > 0 ? (val - resolvedMin) / pointsRange : 0.5;
    const y = height - (ratio * (height - padding * 2) + padding);
    return { x, y };
  });

  // Create path description: M x0 y0 L x1 y1 ...
  const pathD = coordinates
    .map((coord, i) => `${i === 0 ? "M" : "L"} ${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`)
    .join(" ");

  // Create area description for gradient fill underneath
  const areaD = coordinates.length > 0
    ? `${pathD} L ${coordinates[coordinates.length - 1].x.toFixed(1)} ${height} L ${coordinates[0].x.toFixed(1)} ${height} Z`
    : "";

  return (
    <div className="w-full h-12 select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full overflow-visible"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={`sparklineGrad-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2245e3" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#2245e3" stopOpacity="0.00" />
          </linearGradient>
        </defs>
        
        {/* Gradient Area under line */}
        {areaD && (
          <path
            d={areaD}
            fill={`url(#sparklineGrad-${gradientId})`}
            stroke="none"
          />
        )}
        
        {/* Sparkline Path Line */}
        <path
          d={pathD}
          fill="none"
          stroke="#2245e3"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Pulse Dot on the last point */}
        {coordinates.length > 0 && (
          <circle
            cx={coordinates[coordinates.length - 1].x}
            cy={coordinates[coordinates.length - 1].y}
            r="1.5"
            fill="#2245e3"
            className="animate-ping origin-center"
            style={{ transformOrigin: `${coordinates[coordinates.length - 1].x}px ${coordinates[coordinates.length - 1].y}px` }}
          />
        )}
      </svg>
    </div>
  );
}
