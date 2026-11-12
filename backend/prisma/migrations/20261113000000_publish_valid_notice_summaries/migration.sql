-- Backfill the current revision of notices awaiting their first publication.
-- Change the summary and its public pointer atomically, without attributing a human review.
UPDATE notices AS n
JOIN notice_summaries AS s
  ON s.notice_id = n.id AND s.revision_id = n.current_revision_id
LEFT JOIN notice_summaries AS newer
  ON newer.notice_id = s.notice_id AND newer.revision_id = s.revision_id
  AND newer.version_no > s.version_no
SET s.review_status = 'APPROVED',
    s.reviewed_at = UTC_TIMESTAMP(3),
    s.review_note = 'AUTO_PUBLISHED_ON_VALIDATION',
    s.updated_at = UTC_TIMESTAMP(3),
    n.published_summary_id = s.id,
    n.updated_at = UTC_TIMESTAMP(3)
WHERE n.published_summary_id IS NULL
  AND newer.id IS NULL
  AND s.origin = 'AI'
  AND s.validation_status = 'VALID'
  AND s.review_status = 'PENDING'
  AND s.reviewed_by IS NULL;
