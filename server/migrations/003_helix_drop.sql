-- Helix Drop: immutable board definition, per-run gameplay facts and a daily best table.
-- Additive and retry-safe; keep these objects when rolling code back.
ALTER TABLE game_lb_runs
 ADD COLUMN IF NOT EXISTS run_mode VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NULL,
 ADD COLUMN IF NOT EXISTS seed_day DATE NULL,
 ADD COLUMN IF NOT EXISTS floors INT UNSIGNED NULL;
CREATE TABLE IF NOT EXISTS game_lb_daily_best (
 namespace VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 board_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 day DATE NOT NULL,
 player_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 score BIGINT NOT NULL, rank_value BIGINT NOT NULL,
 achieved_at DATETIME(3) NOT NULL,
 run_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY(namespace,board_id,day,player_id),
 KEY ranking(namespace,board_id,day,rank_value,achieved_at,player_id)
);
INSERT IGNORE INTO game_lb_boards
(namespace,id,rules_version,direction,min_score,max_score,min_duration_ms,max_duration_ms,`open`)
VALUES
('production','helix-v1','v1','desc',0,20000,1000,600000,TRUE);
