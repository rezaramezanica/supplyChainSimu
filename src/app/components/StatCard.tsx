export function StatCard({
  label, value, sub, alert = false, info = false,
}: {
  label: string; value: string; sub: string; alert?: boolean; info?: boolean;
}) {
  return (
    <div className={`rounded-lg px-3 py-2.5 border ${alert ? "bg-red-50 border-red-100" : info ? "bg-violet-50 border-violet-100" : "bg-slate-50 border-slate-100"}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-wider ${alert ? "text-red-400" : info ? "text-violet-400" : "text-slate-400"}`}>{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${alert ? "text-red-600" : info ? "text-violet-700" : "text-slate-800"}`}>{value}</p>
      <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
    </div>
  );
}
