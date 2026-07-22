import type { StockMetrics } from "../simulation/types";

export function InventoryCard({
  metrics, color, label, isCritical, stockouts, demandLost,
}: {
  metrics: StockMetrics; color: string; label: string; isCritical?: boolean;
  stockouts?: number; demandLost?: number;
}) {
  const cardWidth = 168, cardHeight = 142;
  const barViewWidth = 10, barViewHeight = 112, barPositionX = 6, barPositionY = 16;
  const fillPercentage      = metrics.capacity > 0 ? Math.min(metrics.current / metrics.capacity, 1) : 0;
  const reorderPointPercent = metrics.capacity > 0 ? Math.min(metrics.reorderPoint / metrics.capacity, 1) : 0;
  const safetyStockPercent  = metrics.capacity > 0 ? Math.min(metrics.safetyStock  / metrics.capacity, 1) : 0;
  const fillColor = metrics.current <= metrics.safetyStock ? "#ef4444" : metrics.current <= metrics.reorderPoint ? "#f59e0b" : color;
  const reorderPointY = barViewHeight * (1 - reorderPointPercent);
  const safetyStockY  = barViewHeight * (1 - safetyStockPercent);
  const minLabelGap = 10;
  const reorderPointLabelY = reorderPointY;
  const safetyStockLabelY  = safetyStockY - reorderPointY < minLabelGap ? reorderPointY + minLabelGap : safetyStockY;
  const stockoutCount   = stockouts   ?? 0;
  const demandLostCount = demandLost  ?? 0;

  return (
    <g>
      <rect x={2} y={2} width={cardWidth} height={cardHeight} rx={7} fill="rgba(0,0,0,0.10)" />
      <rect width={cardWidth} height={cardHeight} rx={7} fill="white" stroke={isCritical ? "#ef4444" : color} strokeWidth={isCritical ? 2.5 : 1.5} strokeOpacity={isCritical ? 0.9 : 0.35} />
      <text x={28} y={16} fontSize={7.5} fontWeight="700" fill="#94a3b8" letterSpacing="0.08em" fontFamily="system-ui, sans-serif">{label}</text>
      <text x={28} y={33} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Current Level</text>
      <text x={cardWidth - 10} y={33} textAnchor="end" fontSize={9} fontWeight="700" fill={fillColor} fontFamily="system-ui, sans-serif">{metrics.current.toLocaleString()} {metrics.unit}</text>
      <line x1={28} y1={39} x2={cardWidth - 10} y2={39} stroke="#f1f5f9" strokeWidth={1} />
      <circle cx={31.5} cy={51} r={3.5} fill="#fef3c7" stroke="#f59e0b" strokeWidth={1} />
      <text x={38} y={55} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Reorder Point</text>
      <text x={cardWidth - 10} y={55} textAnchor="end" fontSize={9} fontWeight="600" fill="#d97706" fontFamily="system-ui, sans-serif">{metrics.reorderPoint.toLocaleString()} {metrics.unit}</text>
      <circle cx={31.5} cy={69} r={3.5} fill="#fee2e2" stroke="#ef4444" strokeWidth={1} />
      <text x={38} y={73} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Safety Stock</text>
      <text x={cardWidth - 10} y={73} textAnchor="end" fontSize={9} fontWeight="600" fill="#dc2626" fontFamily="system-ui, sans-serif">{metrics.safetyStock.toLocaleString()} {metrics.unit}</text>
      <line x1={28} y1={80} x2={cardWidth - 10} y2={80} stroke="#f1f5f9" strokeWidth={1} />
      <circle cx={31.5} cy={90} r={3.5} fill={stockoutCount > 0 ? "#fee2e2" : "#f8fafc"} stroke={stockoutCount > 0 ? "#ef4444" : "#cbd5e1"} strokeWidth={1} />
      <text x={38} y={94} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Stockouts</text>
      <text x={cardWidth - 10} y={94} textAnchor="end" fontSize={9} fontWeight="700" fill={stockoutCount > 0 ? "#dc2626" : "#94a3b8"} fontFamily="system-ui, sans-serif">{stockoutCount}</text>
      <circle cx={31.5} cy={108} r={3.5} fill={demandLostCount > 0 ? "#fef3c7" : "#f8fafc"} stroke={demandLostCount > 0 ? "#f59e0b" : "#cbd5e1"} strokeWidth={1} />
      <text x={38} y={112} fontSize={8.5} fill="#64748b" fontFamily="system-ui, sans-serif">Demand Lost</text>
      <text x={cardWidth - 10} y={112} textAnchor="end" fontSize={9} fontWeight="700" fill={demandLostCount > 0 ? "#d97706" : "#94a3b8"} fontFamily="system-ui, sans-serif">{demandLostCount.toLocaleString()} {metrics.unit}</text>
      <g transform={`translate(${barPositionX}, ${barPositionY})`}>
        <rect width={barViewWidth} height={barViewHeight} rx={3} fill="#f1f5f9" />
        <rect x={0} y={barViewHeight * (1 - fillPercentage)} width={barViewWidth} height={barViewHeight * fillPercentage} rx={3} fill={fillColor} fillOpacity={0.8} />
        <line x1={-3} y1={reorderPointY} x2={barViewWidth + 3} y2={reorderPointY} stroke="#f59e0b" strokeWidth={2} strokeLinecap="round" />
        <text x={barViewWidth + 5} y={reorderPointLabelY + 3} fontSize={7} fill="#d97706" fontWeight="700" fontFamily="system-ui, sans-serif">ROP</text>
        <line x1={-3} y1={safetyStockY} x2={barViewWidth + 3} y2={safetyStockY} stroke="#ef4444" strokeWidth={2} strokeLinecap="round" />
        {safetyStockLabelY !== safetyStockY && <line x1={barViewWidth + 3} y1={safetyStockY} x2={barViewWidth + 3} y2={safetyStockLabelY} stroke="#ef4444" strokeWidth={0.75} strokeOpacity={0.5} />}
        <text x={barViewWidth + 5} y={safetyStockLabelY + 3} fontSize={7} fill="#dc2626" fontWeight="700" fontFamily="system-ui, sans-serif">SS</text>
      </g>
    </g>
  );
}
