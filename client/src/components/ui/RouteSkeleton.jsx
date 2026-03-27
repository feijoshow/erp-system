export default function RouteSkeleton() {
  return (
    <div className="route-skeleton" aria-hidden="true">
      <div className="route-skeleton-sidebar">
        <div className="skeleton-block skeleton-brand" />
        <div className="skeleton-block skeleton-nav" />
        <div className="skeleton-block skeleton-nav" />
        <div className="skeleton-block skeleton-nav" />
        <div className="skeleton-block skeleton-nav" />
      </div>
      <div className="route-skeleton-main">
        <div className="skeleton-block skeleton-title" />
        <div className="skeleton-grid">
          <div className="skeleton-block skeleton-card" />
          <div className="skeleton-block skeleton-card" />
          <div className="skeleton-block skeleton-card" />
        </div>
        <div className="skeleton-block skeleton-table" />
      </div>
    </div>
  );
}
