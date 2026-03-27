export default function PaginationControls({ page, pageSize, totalPages, total, loading, onPageChange, onPageSizeChange }) {
  return (
    <div className="pagination-controls">
      <div className="pagination-summary">
        <span>
          Page {page} of {Math.max(totalPages || 1, 1)}
        </span>
        <span>{total} total records</span>
      </div>

      <div className="pagination-actions">
        <button type="button" className="btn btn-outline btn-small" onClick={() => onPageChange(page - 1)} disabled={loading || page <= 1}>
          Previous
        </button>

        <button
          type="button"
          className="btn btn-outline btn-small"
          onClick={() => onPageChange(page + 1)}
          disabled={loading || page >= Math.max(totalPages || 1, 1)}
        >
          Next
        </button>

        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} disabled={loading}>
          <option value={10}>10 / page</option>
          <option value={20}>20 / page</option>
          <option value={50}>50 / page</option>
        </select>
      </div>
    </div>
  );
}
