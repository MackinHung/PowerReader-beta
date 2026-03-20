-- Migration 0012: Add sub_clusters column to event_clusters
-- Stores sub-cluster grouping within broad topic clusters.
-- JSON array: [{"representative_title":"...","article_ids":["id1"],"article_count":3}]

ALTER TABLE event_clusters ADD COLUMN sub_clusters TEXT DEFAULT NULL;
