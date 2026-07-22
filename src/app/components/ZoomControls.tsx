import { Plus, Minus, RotateCcw } from "lucide-react";

export function ZoomControls({
  onZoomIn,
  onZoomOut,
  onResetView,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
}) {
  return (
    <div className="absolute bottom-5 right-5 z-10 flex flex-col gap-1.5">
      <button onClick={onZoomIn}
        className="w-9 h-9 bg-white border border-slate-200 rounded-lg shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
        title="Zoom in">
        <Plus className="w-4 h-4" />
      </button>
      <button onClick={onZoomOut}
        className="w-9 h-9 bg-white border border-slate-200 rounded-lg shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
        title="Zoom out">
        <Minus className="w-4 h-4" />
      </button>
      <button onClick={onResetView}
        className="w-9 h-9 bg-white border border-slate-200 rounded-lg shadow-sm flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
        title="Reset view">
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
