export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading">
      <div className="h-4 w-32 rounded bg-white/5" />
      <div className="h-12 w-2/3 rounded-xl bg-white/5" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card h-28" />
        ))}
      </div>
      <div className="card h-80" />
    </div>
  );
}
