-- VAYNE Product schema (PostgreSQL)
-- Managed by Alembic; see product/database/alembic/versions/

CREATE TABLE IF NOT EXISTS investigations (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    investigation_key VARCHAR(64),
    source_filename VARCHAR(512) NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    attack_surface_score INTEGER NOT NULL DEFAULT 0,
    attack_surface_classification VARCHAR(32) NOT NULL DEFAULT '',
    path_count INTEGER NOT NULL DEFAULT 0,
    critical_count INTEGER NOT NULL DEFAULT 0,
    raw_report_path TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS attack_paths (
    id VARCHAR(36) PRIMARY KEY,
    investigation_id VARCHAR(36) NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
    stable_id VARCHAR(64) NOT NULL DEFAULT '',
    engine_path_id VARCHAR(32) NOT NULL DEFAULT '',
    confidence INTEGER NOT NULL DEFAULT 0,
    risk DOUBLE PRECISION NOT NULL DEFAULT 0,
    category VARCHAR(64) NOT NULL DEFAULT '',
    mitre TEXT NOT NULL DEFAULT '{}',
    story TEXT NOT NULL DEFAULT '{}',
    proof TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS graph_nodes (
    id VARCHAR(36) PRIMARY KEY,
    investigation_id VARCHAR(36) NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
    node_id VARCHAR(512) NOT NULL,
    node_type VARCHAR(64) NOT NULL DEFAULT '',
    data TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS graph_edges (
    id VARCHAR(36) PRIMARY KEY,
    investigation_id VARCHAR(36) NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
    source VARCHAR(512) NOT NULL,
    target VARCHAR(512) NOT NULL,
    data TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS findings (
    id VARCHAR(36) PRIMARY KEY,
    investigation_id VARCHAR(36) NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
    finding_id VARCHAR(128) NOT NULL DEFAULT '',
    severity VARCHAR(32) NOT NULL DEFAULT '',
    classification VARCHAR(64) NOT NULL DEFAULT '',
    data TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_investigations_key ON investigations(investigation_key);
CREATE INDEX IF NOT EXISTS idx_attack_paths_investigation ON attack_paths(investigation_id);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_investigation ON graph_nodes(investigation_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_investigation ON graph_edges(investigation_id);
CREATE INDEX IF NOT EXISTS idx_findings_investigation ON findings(investigation_id);
