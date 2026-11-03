-- Initial migration for an EMPTY database. CASE-valued CHECKs use explicit = TRUE.
-- HSU PICK DB v2.2 | MySQL 8.4 | 2026-10-27
-- 설계 문서: DB_ERD_20261025.md
-- 새 빈 스키마에 한 번만 실행하는 초기 DDL. 기존 운영 DB용 변경 마이그레이션이 아닙니다.
-- 실행 전 대상 DB를 직접 선택하세요. DB 이름/접속 계정/비밀번호는 포함하지 않습니다.
-- STRICT_TRANS_TABLES 또는 STRICT_ALL_TABLES가 활성화된 MySQL 연결을 사용하세요.
-- MariaDB 전용 SQL이 아닙니다. utf8mb4_0900_* 정렬 규칙 등 호환성을 별도 검토해야 합니다.
-- 34개 테이블을 먼저 생성하고, 아래 ALTER TABLE에서 49개 외래 키를 연결합니다.
-- DROP/TRUNCATE, IF NOT EXISTS, FOREIGN_KEY_CHECKS 해제, 데이터 INSERT는 포함하지 않습니다.
-- 오류 시 즉시 중단하세요(--force 사용 금지). DDL은 전체 트랜잭션으로 되돌릴 수 없습니다.
-- 모든 BIGINT 식별자/FK는 UNSIGNED입니다. API에서는 문자열로 직렬화합니다.
-- DATETIME(3)은 UTC, DATE는 원문의 달력일입니다. 앱의 모든 DB 연결도 UTC로 설정하세요.
-- updated_at의 DEFAULT는 생성 시각만 설정합니다. 수정 시 Prisma/서비스에서 갱신합니다.
-- 원문/분석/공개 요약의 불변성, 목적/예외/근거 검증은 서비스 트랜잭션에서 보장합니다.
-- 공식 문법 참고:
-- https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html
-- https://dev.mysql.com/doc/refman/8.4/en/create-table-check-constraints.html
-- https://dev.mysql.com/doc/refman/8.4/en/implicit-commit.html

SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;
SET SESSION time_zone = '+00:00';

-- 1. 테이블, 기본 키, UNIQUE, 조회 인덱스 및 행 내부 CHECK

-- 01. 회원 계정
CREATE TABLE `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `login_id` VARCHAR(20) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL COMMENT 'Normalized lowercase ASCII login ID; case-insensitive login is a proposed policy.',
  `password_hash` VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` VARCHAR(30) NOT NULL,
  `status` ENUM('ACTIVE', 'SUSPENDED', 'WITHDRAWN') CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'ACTIVE',
  `role` ENUM('MEMBER', 'REVIEWER', 'ADMIN') CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'MEMBER',
  `last_login_at` DATETIME(3) NULL,
  `withdrawn_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_01` (`login_id`)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='회원 계정';

-- 02. 추천 프로필
CREATE TABLE `user_profiles` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `grade` ENUM('YEAR_1', 'YEAR_2', 'YEAR_3', 'YEAR_4', 'OTHER') CHARACTER SET ascii COLLATE ascii_bin NULL,
  `completed_at` DATETIME(3) NULL COMMENT 'Null until grade, slots and interests pass the profile rules.',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='추천 프로필';

-- 03. 로그인 세션
CREATE TABLE `user_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `refresh_token_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `revoked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_sessions_01` (`refresh_token_hash`),
  KEY `idx_user_sessions_02` (`user_id`, `revoked_at`, `expires_at`),
  KEY `idx_user_sessions_03` (`expires_at`),
  CONSTRAINT `ck_user_sessions_expiration` CHECK (`expires_at` > `created_at`)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='로그인 세션';

-- 04. 대학·학부·학과·트랙
CREATE TABLE `academic_units` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(64) COLLATE utf8mb4_0900_as_cs NOT NULL COMMENT 'Stable service identifier, never the frontend array index.',
  `parent_id` BIGINT UNSIGNED NULL,
  `kind` ENUM('COLLEGE', 'DEPARTMENT', 'TRACK') CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `aliases_json` JSON NULL COMMENT 'Historical names/search aliases; not automatically a different academic unit.',
  `note` TEXT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_academic_units_01` (`code`),
  KEY `idx_academic_units_02` (`parent_id`),
  KEY `idx_academic_units_03` (`kind`, `is_active`),
  CONSTRAINT `ck_academic_units_is_active` CHECK (`is_active` IN (0, 1)),
  CONSTRAINT `ck_academic_units_sort_order` CHECK (`sort_order` >= 0)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='대학·학부·학과·트랙';

-- 05. 사용자 소속 슬롯
CREATE TABLE `user_academic_units` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `slot` TINYINT NOT NULL COMMENT '1, 2 or 3; required slots depend on grade.',
  `academic_unit_id` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`, `slot`),
  UNIQUE KEY `uq_user_academic_units_01` (`user_id`, `academic_unit_id`),
  KEY `idx_user_academic_units_02` (`academic_unit_id`),
  CONSTRAINT `ck_user_academic_units_slot` CHECK (`slot` BETWEEN 1 AND 3)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='사용자 소속 슬롯';

-- 06. 관심 분야
CREATE TABLE `topics` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(32) COLLATE utf8mb4_0900_as_cs NOT NULL,
  `name` VARCHAR(50) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `sort_order` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_topics_01` (`code`),
  CONSTRAINT `ck_topics_is_active` CHECK (`is_active` IN (0, 1)),
  CONSTRAINT `ck_topics_sort_order` CHECK (`sort_order` >= 0)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='관심 분야';

-- 07. 사용자 관심 분야
CREATE TABLE `user_topics` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `topic_id` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`, `topic_id`),
  KEY `idx_user_topics_01` (`topic_id`)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='사용자 관심 분야';

-- 08. 수집 출처
CREATE TABLE `sources` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(64) COLLATE utf8mb4_0900_as_cs NOT NULL,
  `kind` ENUM('NOTICE', 'PROGRAM') CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `base_url` VARCHAR(512) NOT NULL,
  `list_url` TEXT NOT NULL,
  `board_key` VARCHAR(64) COLLATE utf8mb4_0900_as_cs NULL COMMENT 'One source per board; e.g. hansung/2127.',
  `enabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `interval_minutes` INT NULL COMMENT 'Positive interval, null means manual execution only.',
  `cursor_json` JSON NULL COMMENT 'Successful listing cursor/watermark; not a numeric-ID range crawler.',
  `last_success_at` DATETIME(3) NULL,
  `next_run_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sources_01` (`code`),
  KEY `idx_sources_02` (`enabled`, `next_run_at`),
  CONSTRAINT `ck_sources_enabled` CHECK (`enabled` IN (0, 1)),
  CONSTRAINT `ck_sources_interval_minutes` CHECK (`interval_minutes` > 0)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='수집 출처';

-- 09. 수집 실행
CREATE TABLE `crawl_runs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `source_id` BIGINT UNSIGNED NOT NULL,
  `run_key` VARCHAR(128) COLLATE utf8mb4_0900_as_cs NOT NULL,
  `mode` ENUM('INITIAL', 'INCREMENTAL', 'RECHECK', 'FILE_IMPORT') CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `status` ENUM('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED') CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'QUEUED',
  `started_at` DATETIME(3) NULL,
  `finished_at` DATETIME(3) NULL,
  `stats_json` JSON NULL,
  `error_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_crawl_runs_01` (`run_key`),
  KEY `idx_crawl_runs_02` (`source_id`, `created_at`),
  KEY `idx_crawl_runs_03` (`status`, `created_at`),
  CONSTRAINT `ck_crawl_runs_run_time` CHECK (`finished_at` IS NULL OR (`started_at` IS NOT NULL AND `finished_at` >= `started_at`))
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='수집 실행';

-- 10. 게시물별 수집 기록
-- At most one of notice_id/program_id is set. Failed discovery can have neither. Linked content must belong to the run source; validate transactionally.
CREATE TABLE `crawl_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `crawl_run_id` BIGINT UNSIGNED NOT NULL,
  `external_id` VARCHAR(128) COLLATE utf8mb4_0900_as_cs NOT NULL,
  `source_url` TEXT NULL,
  `notice_id` BIGINT UNSIGNED NULL,
  `program_id` BIGINT UNSIGNED NULL,
  `status` ENUM('DISCOVERED', 'UNCHANGED', 'CREATED', 'UPDATED', 'FAILED', 'UNAVAILABLE') CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'DISCOVERED',
  `attempt_count` INT NOT NULL DEFAULT 0,
  `http_status` INT NULL,
  `content_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `error_json` JSON NULL,
  `fetched_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_crawl_records_01` (`crawl_run_id`, `external_id`),
  KEY `idx_crawl_records_02` (`crawl_run_id`, `status`),
  KEY `idx_crawl_records_03` (`notice_id`),
  KEY `idx_crawl_records_04` (`program_id`),
  CONSTRAINT `ck_crawl_records_attempt_count` CHECK (`attempt_count` >= 0),
  CONSTRAINT `ck_crawl_records_http_status` CHECK (`http_status` IS NULL OR `http_status` BETWEEN 100 AND 599)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='게시물별 수집 기록';

-- 11. 공지 분류
CREATE TABLE `notice_categories` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(32) COLLATE utf8mb4_0900_as_cs NOT NULL,
  `name` VARCHAR(50) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `sort_order` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notice_categories_01` (`code`),
  CONSTRAINT `ck_notice_categories_is_active` CHECK (`is_active` IN (0, 1)),
  CONSTRAINT `ck_notice_categories_sort_order` CHECK (`sort_order` >= 0)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='공지 분류';

-- 12. 공지 식별 및 공개 포인터
CREATE TABLE `notices` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` VARCHAR(128) COLLATE utf8mb4_0900_as_cs NOT NULL COMMENT 'For this board: hansung-2127-225417; same as existing AI JSON id.',
  `source_id` BIGINT UNSIGNED NOT NULL,
  `external_id` VARCHAR(128) COLLATE utf8mb4_0900_as_cs NOT NULL COMMENT 'Source article number as a string; not local primary key.',
  `canonical_url` VARCHAR(2048) NOT NULL,
  `current_revision_id` BIGINT UNSIGNED NULL,
  `published_summary_id` BIGINT UNSIGNED NULL,
  `visibility` ENUM('PUBLIC', 'HIDDEN', 'REMOVED_AT_SOURCE') CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'PUBLIC',
  `first_collected_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_seen_at` DATETIME(3) NOT NULL,
  `last_checked_at` DATETIME(3) NOT NULL,
  `removed_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notices_01` (`public_id`),
  UNIQUE KEY `uq_notices_02` (`source_id`, `external_id`),
  KEY `idx_notices_03` (`visibility`, `last_seen_at`),
  KEY `idx_notices_04` (`id`, `current_revision_id`),
  KEY `idx_notices_05` (`id`, `published_summary_id`)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='공지 식별 및 공개 포인터';

-- 13. 공지 원문 버전
CREATE TABLE `notice_revisions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `notice_id` BIGINT UNSIGNED NOT NULL,
  `revision_no` INT NOT NULL,
  `source_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'Exact MHTML/HTML input hash; existing source.sha256.',
  `content_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'Normalized meaningful content + asset hashes, not navigation/view counts.',
  `preprocess_version` VARCHAR(64) NOT NULL,
  `title` VARCHAR(512) NOT NULL,
  `source_category` VARCHAR(128) NULL,
  `author` VARCHAR(128) NULL,
  `published_date` DATE NULL COMMENT 'Source only provides a civil date in current notices.',
  `body_text` LONGTEXT NULL,
  `sanitized_html` LONGTEXT NULL,
  `original_artifact_key` VARCHAR(1024) NULL,
  `preprocessed_json` JSON NOT NULL COMMENT 'Ordered text/table/image blocks and source metadata; no image binaries.',
  `collected_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notice_revisions_01` (`notice_id`, `revision_no`),
  UNIQUE KEY `uq_notice_revisions_02` (`notice_id`, `id`),
  KEY `idx_notice_revisions_03` (`notice_id`, `content_hash`),
  KEY `idx_notice_revisions_04` (`notice_id`, `source_hash`, `preprocess_version`),
  KEY `idx_notice_revisions_05` (`published_date`),
  CONSTRAINT `ck_notice_revisions_revision_no` CHECK (`revision_no` > 0)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='공지 원문 버전';

-- 14. 공지 이미지·첨부
CREATE TABLE `notice_assets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `revision_id` BIGINT UNSIGNED NOT NULL,
  `block_id` VARCHAR(128) COLLATE utf8mb4_0900_as_cs NOT NULL COMMENT 'Evidence ID scoped to this revision, e.g. image-001.',
  `kind` ENUM('IMAGE', 'ATTACHMENT') CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `sort_order` INT NOT NULL,
  `source_url` TEXT NULL,
  `object_key` VARCHAR(1024) NULL,
  `storage_status` ENUM('REMOTE_ONLY', 'STORED', 'FAILED') CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'REMOTE_ONLY',
  `filename` VARCHAR(512) NULL,
  `alt_text` TEXT NULL,
  `mime_type` VARCHAR(128) NULL,
  `sha256` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `size_bytes` BIGINT UNSIGNED NULL,
  `width` INT NULL,
  `height` INT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notice_assets_01` (`revision_id`, `block_id`),
  KEY `idx_notice_assets_02` (`revision_id`, `sort_order`),
  KEY `idx_notice_assets_03` (`sha256`),
  CONSTRAINT `ck_notice_assets_sort_order` CHECK (`sort_order` >= 0),
  CONSTRAINT `ck_notice_assets_width` CHECK (`width` >= 0),
  CONSTRAINT `ck_notice_assets_height` CHECK (`height` >= 0)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='공지 이미지·첨부';

-- 15. AI 실행 원본 및 성능
CREATE TABLE `notice_analyses` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `revision_id` BIGINT UNSIGNED NOT NULL,
  `import_key` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'Hash of run key + article + model digest + attempt; import idempotency.',
  `run_key` VARCHAR(128) COLLATE utf8mb4_0900_as_cs NOT NULL COMMENT 'Existing execution-manifest id, grouped across 20 notices.',
  `attempt_no` INT NOT NULL DEFAULT 1,
  `model_name` VARCHAR(128) NOT NULL,
  `model_digest` VARCHAR(128) NULL,
  `pipeline_version` VARCHAR(64) NOT NULL,
  `code_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `schema_version` VARCHAR(32) NOT NULL,
  `input_fingerprint` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `configuration_json` JSON NOT NULL,
  `status` ENUM('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED') CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'QUEUED',
  `needs_review` BOOLEAN NULL COMMENT 'Null for failed/unvalidated output; false is NOT human approval.',
  `review_issues_json` JSON NULL,
  `result_json` JSON NULL COMMENT 'Unmodified detailed AI result, including evidence; null if failed.',
  `metrics_json` JSON NULL COMMENT 'Calls, imageReadings, normalizations, tokens and timings.',
  `error_json` JSON NULL,
  `raw_response_artifact_key` VARCHAR(1024) NULL,
  `manifest_artifact_key` VARCHAR(1024) NULL,
  `started_at` DATETIME(3) NULL,
  `finished_at` DATETIME(3) NULL,
  `wall_seconds` DECIMAL(14,3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notice_analyses_01` (`import_key`),
  UNIQUE KEY `uq_notice_analyses_02` (`id`, `revision_id`),
  KEY `idx_notice_analyses_03` (`revision_id`, `created_at`),
  KEY `idx_notice_analyses_04` (`input_fingerprint`),
  KEY `idx_notice_analyses_05` (`run_key`),
  KEY `idx_notice_analyses_06` (`status`, `created_at`),
  CONSTRAINT `ck_notice_analyses_attempt_no` CHECK (`attempt_no` > 0),
  CONSTRAINT `ck_notice_analyses_needs_review` CHECK (`needs_review` IN (0, 1)),
  CONSTRAINT `ck_notice_analyses_wall_seconds` CHECK (`wall_seconds` >= 0),
  CONSTRAINT `ck_notice_analyses_run_time` CHECK (`finished_at` IS NULL OR (`started_at` IS NOT NULL AND `finished_at` >= `started_at`)),
  CONSTRAINT `ck_notice_analyses_completed` CHECK (`status` <> 'COMPLETED' OR (`result_json` IS NOT NULL AND `needs_review` IS NOT NULL))
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='AI 실행 원본 및 성능';

-- 16. 검증·승인할 서비스 요약
-- Published content is immutable. Edits create a new summary version. JSON and typed target/period/item projections must agree. Publication requires validation_status VALID and review_status APPROVED, not merely needs_review false. See companion rules for accepted limitations.
CREATE TABLE `notice_summaries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `notice_id` BIGINT UNSIGNED NOT NULL,
  `revision_id` BIGINT UNSIGNED NOT NULL,
  `analysis_id` BIGINT UNSIGNED NULL COMMENT 'Null only for a fully human-authored summary.',
  `version_no` INT NOT NULL,
  `origin` ENUM('AI', 'HUMAN') CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'AI',
  `projection_version` VARCHAR(32) NOT NULL,
  `category_id` BIGINT UNSIGNED NOT NULL,
  `primary_topic_id` BIGINT UNSIGNED NULL,
  `kind` ENUM('recruitment', 'education', 'academic_application', 'scholarship_policy', 'event', 'survey', 'collection', 'general') CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `one_line_summary` VARCHAR(180) NOT NULL,
  `summary_json` JSON NOT NULL,
  `application_status` ENUM('stated', 'not_stated', 'not_applicable') CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `application_json` JSON NOT NULL,
  `audience_json` JSON NULL COMMENT 'Schema 1.2 audience: description, qualifications/exclusions with nested exceptions, preferences and recommended. No flattened exception list.',
  `activity_periods_json` JSON NULL,
  `benefits_json` JSON NULL,
  `preparations_json` JSON NULL,
  `operation_guide_json` JSON NULL,
  `details_json` JSON NULL,
  `tags_json` JSON NULL,
  `grade_scope` ENUM('UNKNOWN', 'ALL', 'RESTRICTED') CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'UNKNOWN' COMMENT 'Mandatory grade scope only. Counts REQUIRED target rows, never PREFERRED/RECOMMENDED.',
  `academic_scope` ENUM('UNKNOWN', 'ALL', 'RESTRICTED') CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'UNKNOWN' COMMENT 'Mandatory academic scope only; UNKNOWN is not ineligible.',
  `eligibility_basis_json` JSON NULL COMMENT 'Basis for mandatory scopes, ALL/UNKNOWN reasons and unsupported compound/exception logic. Per-target basis is on each target row.',
  `validation_status` ENUM('VALID', 'NEEDS_REVIEW', 'INVALID') CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'NEEDS_REVIEW' COMMENT 'Service projection checks, separate from AI needs_review and human review_status. VALID is not final applicant eligibility.',
  `validation_issues_json` JSON NULL COMMENT 'Version-scoped issues with id, code, paths, evidence, message and detector. Includes importer/manual findings absent from AI output.',
  `review_status` ENUM('PENDING', 'APPROVED', 'REJECTED') CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'PENDING',
  `review_resolution_json` JSON NULL COMMENT 'Each issue disposition: corrected, accepted limitation, or unresolved.',
  `reviewed_by` BIGINT UNSIGNED NULL,
  `reviewed_at` DATETIME(3) NULL,
  `review_note` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notice_summaries_01` (`notice_id`, `version_no`),
  UNIQUE KEY `uq_notice_summaries_02` (`notice_id`, `id`),
  KEY `idx_notice_summaries_03` (`notice_id`, `revision_id`),
  KEY `idx_notice_summaries_04` (`analysis_id`, `revision_id`),
  KEY `idx_notice_summaries_05` (`category_id`, `review_status`),
  KEY `idx_notice_summaries_06` (`primary_topic_id`, `review_status`),
  KEY `idx_notice_summaries_07` (`review_status`, `created_at`),
  KEY `idx_notice_summaries_08` (`validation_status`, `created_at`),
  CONSTRAINT `ck_notice_summaries_version_no` CHECK (`version_no` > 0),
  CONSTRAINT `ck_notice_summaries_approval` CHECK (`review_status` <> 'APPROVED' OR (`validation_status` = 'VALID' AND `reviewed_at` IS NOT NULL)),
  CONSTRAINT `ck_notice_summaries_validated` CHECK (`validation_status` <> 'VALID' OR `validation_issues_json` IS NOT NULL)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='검증·승인할 서비스 요약';

-- 17. 공지 신청·활동 일정
-- Null precision = absent endpoint. unknown precision = present but unresolved. A standalone deadline is an APPLICATION row with no start. Do not duplicate a combined deadline as a third route.
CREATE TABLE `notice_periods` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `summary_id` BIGINT UNSIGNED NOT NULL,
  `role` ENUM('APPLICATION', 'ACTIVITY', 'RESULT', 'OTHER') CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `label` VARCHAR(255) NOT NULL,
  `sort_order` INT NOT NULL,
  `start_raw` TEXT NULL,
  `start_precision` ENUM('date', 'datetime', 'unknown') CHARACTER SET ascii COLLATE ascii_bin NULL,
  `start_date` DATE NULL,
  `start_at` DATETIME(3) NULL,
  `end_raw` TEXT NULL,
  `end_precision` ENUM('date', 'datetime', 'unknown') CHARACTER SET ascii COLLATE ascii_bin NULL,
  `end_date` DATE NULL,
  `end_at` DATETIME(3) NULL,
  `evidence_json` JSON NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notice_periods_01` (`summary_id`, `role`, `sort_order`),
  KEY `idx_notice_periods_02` (`role`, `end_date`, `summary_id`),
  KEY `idx_notice_periods_03` (`role`, `end_at`, `summary_id`),
  CONSTRAINT `ck_notice_periods_sort_order` CHECK (`sort_order` >= 0),
  CONSTRAINT `ck_notice_periods_start_shape` CHECK (CASE
      WHEN `start_precision` IS NULL THEN `start_raw` IS NULL AND `start_date` IS NULL AND `start_at` IS NULL
      WHEN `start_precision` = 'unknown' THEN `start_raw` IS NOT NULL AND `start_date` IS NULL AND `start_at` IS NULL
      WHEN `start_precision` = 'date' THEN `start_raw` IS NOT NULL AND `start_date` IS NOT NULL AND `start_at` IS NULL
      WHEN `start_precision` = 'datetime' THEN `start_raw` IS NOT NULL AND `start_date` IS NULL AND `start_at` IS NOT NULL
      ELSE FALSE
    END = TRUE),
  CONSTRAINT `ck_notice_periods_end_shape` CHECK (CASE
      WHEN `end_precision` IS NULL THEN `end_raw` IS NULL AND `end_date` IS NULL AND `end_at` IS NULL
      WHEN `end_precision` = 'unknown' THEN `end_raw` IS NOT NULL AND `end_date` IS NULL AND `end_at` IS NULL
      WHEN `end_precision` = 'date' THEN `end_raw` IS NOT NULL AND `end_date` IS NOT NULL AND `end_at` IS NULL
      WHEN `end_precision` = 'datetime' THEN `end_raw` IS NOT NULL AND `end_date` IS NULL AND `end_at` IS NOT NULL
      ELSE FALSE
    END = TRUE),
  CONSTRAINT `ck_notice_periods_order_date` CHECK (`start_date` IS NULL OR `end_date` IS NULL OR `start_date` <= `end_date`),
  CONSTRAINT `ck_notice_periods_order_at` CHECK (`start_at` IS NULL OR `end_at` IS NULL OR `start_at` <= `end_at`)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='공지 신청·활동 일정';

-- 18. 모음글의 개별 공고
CREATE TABLE `notice_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `summary_id` BIGINT UNSIGNED NOT NULL,
  `sort_order` INT NOT NULL,
  `title` VARCHAR(512) NOT NULL,
  `organization` VARCHAR(255) NULL,
  `original_url` TEXT NULL,
  `deadline_raw` TEXT NULL,
  `deadline_precision` ENUM('date', 'datetime', 'unknown') CHARACTER SET ascii COLLATE ascii_bin NULL,
  `deadline_date` DATE NULL,
  `deadline_at` DATETIME(3) NULL,
  `facts_json` JSON NULL,
  `evidence_json` JSON NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notice_items_01` (`summary_id`, `sort_order`),
  KEY `idx_notice_items_02` (`deadline_date`),
  KEY `idx_notice_items_03` (`deadline_at`),
  CONSTRAINT `ck_notice_items_sort_order` CHECK (`sort_order` >= 0),
  CONSTRAINT `ck_notice_items_deadline_shape` CHECK (CASE
      WHEN `deadline_precision` IS NULL THEN `deadline_raw` IS NULL AND `deadline_date` IS NULL AND `deadline_at` IS NULL
      WHEN `deadline_precision` = 'unknown' THEN `deadline_raw` IS NOT NULL AND `deadline_date` IS NULL AND `deadline_at` IS NULL
      WHEN `deadline_precision` = 'date' THEN `deadline_raw` IS NOT NULL AND `deadline_date` IS NOT NULL AND `deadline_at` IS NULL
      WHEN `deadline_precision` = 'datetime' THEN `deadline_raw` IS NOT NULL AND `deadline_date` IS NULL AND `deadline_at` IS NOT NULL
      ELSE FALSE
    END = TRUE)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='모음글의 개별 공고';

-- 19. 목적별 대상 학년
CREATE TABLE `notice_target_grades` (
  `summary_id` BIGINT UNSIGNED NOT NULL,
  `purpose` ENUM('REQUIRED', 'PREFERRED', 'RECOMMENDED') CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'Explicitly mapped; no default. Recommended/preferred grades must never become hard exclusions.',
  `grade` ENUM('YEAR_1', 'YEAR_2', 'YEAR_3', 'YEAR_4', 'OTHER') CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `basis_json` JSON NOT NULL COMMENT 'Source paths, evidence IDs and mapping rationale scoped to this summary/revision; see companion contract.',
  PRIMARY KEY (`summary_id`, `purpose`, `grade`),
  KEY `idx_notice_target_grades_01` (`grade`, `purpose`, `summary_id`)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='목적별 대상 학년';

-- 20. 목적별 대상 소속
CREATE TABLE `notice_target_units` (
  `summary_id` BIGINT UNSIGNED NOT NULL,
  `purpose` ENUM('REQUIRED', 'PREFERRED', 'RECOMMENDED') CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `academic_unit_id` BIGINT UNSIGNED NOT NULL,
  `include_descendants` BOOLEAN NOT NULL DEFAULT FALSE,
  `basis_json` JSON NOT NULL COMMENT 'Source paths, evidence IDs and rationale for unit/purpose/descendant mapping; never infer a mandatory major from a recommendation.',
  PRIMARY KEY (`summary_id`, `purpose`, `academic_unit_id`),
  KEY `idx_notice_target_units_01` (`academic_unit_id`, `purpose`, `summary_id`),
  CONSTRAINT `ck_notice_target_units_include_descendants` CHECK (`include_descendants` IN (0, 1))
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='목적별 대상 소속';

-- 21. 공지 북마크
CREATE TABLE `user_notice_bookmarks` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `notice_id` BIGINT UNSIGNED NOT NULL,
  `deadline_reminder_enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`, `notice_id`),
  KEY `idx_user_notice_bookmarks_01` (`user_id`, `created_at`),
  KEY `idx_user_notice_bookmarks_02` (`notice_id`),
  CONSTRAINT `ck_user_notice_bookmarks_reminder` CHECK (`deadline_reminder_enabled` IN (0, 1))
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='공지 북마크';

-- 22. 프로그램 분류
CREATE TABLE `program_categories` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(32) COLLATE utf8mb4_0900_as_cs NOT NULL,
  `name` VARCHAR(50) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `sort_order` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_program_categories_01` (`code`),
  CONSTRAINT `ck_program_categories_is_active` CHECK (`is_active` IN (0, 1)),
  CONSTRAINT `ck_program_categories_sort_order` CHECK (`sort_order` >= 0)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='프로그램 분류';

-- 23. 프로그램 식별 및 현재 버전
CREATE TABLE `programs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` VARCHAR(128) COLLATE utf8mb4_0900_as_cs NOT NULL COMMENT 'hsportal-program-14063; disjoint from notice public IDs.',
  `source_id` BIGINT UNSIGNED NOT NULL,
  `external_id` VARCHAR(128) COLLATE utf8mb4_0900_as_cs NOT NULL,
  `canonical_url` VARCHAR(2048) NULL COMMENT 'Null if an actual public detail URL has not been verified.',
  `current_revision_id` BIGINT UNSIGNED NULL,
  `visibility` ENUM('PUBLIC', 'HIDDEN', 'REMOVED_AT_SOURCE') CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'PUBLIC',
  `first_collected_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_seen_at` DATETIME(3) NOT NULL,
  `last_checked_at` DATETIME(3) NOT NULL,
  `removed_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_programs_01` (`public_id`),
  UNIQUE KEY `uq_programs_02` (`source_id`, `external_id`),
  KEY `idx_programs_03` (`id`, `current_revision_id`),
  KEY `idx_programs_04` (`visibility`, `last_seen_at`)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='프로그램 식별 및 현재 버전';

-- 24. 프로그램 공개정보 버전
CREATE TABLE `program_revisions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `program_id` BIGINT UNSIGNED NOT NULL,
  `revision_no` INT NOT NULL,
  `source_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `content_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `parser_version` VARCHAR(64) NOT NULL,
  `title` VARCHAR(512) NOT NULL,
  `source_category` VARCHAR(128) NULL,
  `category_id` BIGINT UNSIGNED NOT NULL,
  `primary_topic_id` BIGINT UNSIGNED NULL,
  `author` VARCHAR(128) NULL,
  `department` VARCHAR(255) NULL,
  `published_date` DATE NULL,
  `public_summary` TEXT NULL,
  `audience_text` TEXT NULL,
  `application_period_text` TEXT NULL,
  `application_status` ENUM('stated', 'not_stated', 'not_applicable') CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'not_stated',
  `apply_start_raw` TEXT NULL,
  `apply_start_precision` ENUM('date', 'datetime', 'unknown') CHARACTER SET ascii COLLATE ascii_bin NULL,
  `apply_start_date` DATE NULL,
  `apply_start_at` DATETIME(3) NULL,
  `apply_end_raw` TEXT NULL,
  `apply_end_precision` ENUM('date', 'datetime', 'unknown') CHARACTER SET ascii COLLATE ascii_bin NULL,
  `apply_end_date` DATE NULL,
  `apply_end_at` DATETIME(3) NULL,
  `activity_periods_json` JSON NULL,
  `points` DECIMAL(10,2) NULL COMMENT 'Exact, unconditional displayed value only; zero is valid, unknown/range is null.',
  `points_text` TEXT NULL,
  `location` TEXT NULL,
  `delivery_format` VARCHAR(255) NULL,
  `participation_mode` VARCHAR(64) NULL COMMENT 'Only when explicitly stated; never default individual/team.',
  `body_text` LONGTEXT NULL,
  `sanitized_html` LONGTEXT NULL,
  `tags_json` JSON NULL,
  `grade_scope` ENUM('UNKNOWN', 'ALL', 'RESTRICTED') CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'UNKNOWN' COMMENT 'Mandatory scope; only REQUIRED rows constrain it.',
  `academic_scope` ENUM('UNKNOWN', 'ALL', 'RESTRICTED') CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'UNKNOWN' COMMENT 'Mandatory scope; soft targets do not exclude applicants.',
  `eligibility_basis_json` JSON NULL COMMENT 'Public-source basis for mandatory scopes and unresolved compound/exception logic.',
  `source_application_state` VARCHAR(128) NULL COMMENT 'Source wording at collection time, NOT the current live state.',
  `raw_metadata_json` JSON NOT NULL,
  `original_artifact_key` VARCHAR(1024) NULL,
  `validation_status` ENUM('VALID', 'NEEDS_REVIEW', 'INVALID') CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'NEEDS_REVIEW' COMMENT 'Includes source-to-purpose target mapping checks; not proof of final applicant eligibility.',
  `validation_issues_json` JSON NULL COMMENT 'Version-scoped validation findings. Unknown source information alone is not an invalid record.',
  `collected_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_program_revisions_01` (`program_id`, `revision_no`),
  UNIQUE KEY `uq_program_revisions_02` (`program_id`, `id`),
  KEY `idx_program_revisions_03` (`program_id`, `content_hash`),
  KEY `idx_program_revisions_04` (`category_id`, `validation_status`),
  KEY `idx_program_revisions_05` (`primary_topic_id`, `validation_status`),
  KEY `idx_program_revisions_06` (`apply_end_date`),
  KEY `idx_program_revisions_07` (`apply_end_at`),
  KEY `idx_program_revisions_08` (`published_date`),
  CONSTRAINT `ck_program_revisions_revision_no` CHECK (`revision_no` > 0),
  CONSTRAINT `ck_program_revisions_points` CHECK (`points` >= 0),
  CONSTRAINT `ck_program_revisions_validated` CHECK (`validation_status` <> 'VALID' OR `validation_issues_json` IS NOT NULL),
  CONSTRAINT `ck_program_revisions_apply_start_shape` CHECK (CASE
      WHEN `apply_start_precision` IS NULL THEN `apply_start_raw` IS NULL AND `apply_start_date` IS NULL AND `apply_start_at` IS NULL
      WHEN `apply_start_precision` = 'unknown' THEN `apply_start_raw` IS NOT NULL AND `apply_start_date` IS NULL AND `apply_start_at` IS NULL
      WHEN `apply_start_precision` = 'date' THEN `apply_start_raw` IS NOT NULL AND `apply_start_date` IS NOT NULL AND `apply_start_at` IS NULL
      WHEN `apply_start_precision` = 'datetime' THEN `apply_start_raw` IS NOT NULL AND `apply_start_date` IS NULL AND `apply_start_at` IS NOT NULL
      ELSE FALSE
    END = TRUE),
  CONSTRAINT `ck_program_revisions_apply_end_shape` CHECK (CASE
      WHEN `apply_end_precision` IS NULL THEN `apply_end_raw` IS NULL AND `apply_end_date` IS NULL AND `apply_end_at` IS NULL
      WHEN `apply_end_precision` = 'unknown' THEN `apply_end_raw` IS NOT NULL AND `apply_end_date` IS NULL AND `apply_end_at` IS NULL
      WHEN `apply_end_precision` = 'date' THEN `apply_end_raw` IS NOT NULL AND `apply_end_date` IS NOT NULL AND `apply_end_at` IS NULL
      WHEN `apply_end_precision` = 'datetime' THEN `apply_end_raw` IS NOT NULL AND `apply_end_date` IS NULL AND `apply_end_at` IS NOT NULL
      ELSE FALSE
    END = TRUE),
  CONSTRAINT `ck_program_revisions_order_date` CHECK (`apply_start_date` IS NULL OR `apply_end_date` IS NULL OR `apply_start_date` <= `apply_end_date`),
  CONSTRAINT `ck_program_revisions_order_at` CHECK (`apply_start_at` IS NULL OR `apply_end_at` IS NULL OR `apply_start_at` <= `apply_end_at`)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='프로그램 공개정보 버전';

-- 25. 프로그램 세부 모집 단위
-- Zero or more verified recruitment units. No synthetic session is required for a simple program. Do not sum mutually exclusive session points.
CREATE TABLE `program_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `revision_id` BIGINT UNSIGNED NOT NULL,
  `session_key` VARCHAR(128) COLLATE utf8mb4_0900_as_cs NOT NULL COMMENT 'Source session ID or revision-scoped import key; never name as PK.',
  `title` VARCHAR(512) NOT NULL,
  `sort_order` INT NOT NULL,
  `original_url` TEXT NULL,
  `points` DECIMAL(10,2) NULL,
  `points_text` TEXT NULL,
  `application_period_text` TEXT NULL,
  `apply_start_raw` TEXT NULL,
  `apply_start_precision` ENUM('date', 'datetime', 'unknown') CHARACTER SET ascii COLLATE ascii_bin NULL,
  `apply_start_date` DATE NULL,
  `apply_start_at` DATETIME(3) NULL,
  `apply_end_raw` TEXT NULL,
  `apply_end_precision` ENUM('date', 'datetime', 'unknown') CHARACTER SET ascii COLLATE ascii_bin NULL,
  `apply_end_date` DATE NULL,
  `apply_end_at` DATETIME(3) NULL,
  `activity_periods_json` JSON NULL,
  `audience_text` TEXT NULL,
  `capacity` INT NULL,
  `raw_metadata_json` JSON NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_program_sessions_01` (`revision_id`, `session_key`),
  KEY `idx_program_sessions_02` (`revision_id`, `sort_order`),
  KEY `idx_program_sessions_03` (`apply_end_date`),
  KEY `idx_program_sessions_04` (`apply_end_at`),
  CONSTRAINT `ck_program_sessions_sort_order` CHECK (`sort_order` >= 0),
  CONSTRAINT `ck_program_sessions_points` CHECK (`points` >= 0),
  CONSTRAINT `ck_program_sessions_capacity` CHECK (`capacity` >= 0),
  CONSTRAINT `ck_program_sessions_apply_start_shape` CHECK (CASE
      WHEN `apply_start_precision` IS NULL THEN `apply_start_raw` IS NULL AND `apply_start_date` IS NULL AND `apply_start_at` IS NULL
      WHEN `apply_start_precision` = 'unknown' THEN `apply_start_raw` IS NOT NULL AND `apply_start_date` IS NULL AND `apply_start_at` IS NULL
      WHEN `apply_start_precision` = 'date' THEN `apply_start_raw` IS NOT NULL AND `apply_start_date` IS NOT NULL AND `apply_start_at` IS NULL
      WHEN `apply_start_precision` = 'datetime' THEN `apply_start_raw` IS NOT NULL AND `apply_start_date` IS NULL AND `apply_start_at` IS NOT NULL
      ELSE FALSE
    END = TRUE),
  CONSTRAINT `ck_program_sessions_apply_end_shape` CHECK (CASE
      WHEN `apply_end_precision` IS NULL THEN `apply_end_raw` IS NULL AND `apply_end_date` IS NULL AND `apply_end_at` IS NULL
      WHEN `apply_end_precision` = 'unknown' THEN `apply_end_raw` IS NOT NULL AND `apply_end_date` IS NULL AND `apply_end_at` IS NULL
      WHEN `apply_end_precision` = 'date' THEN `apply_end_raw` IS NOT NULL AND `apply_end_date` IS NOT NULL AND `apply_end_at` IS NULL
      WHEN `apply_end_precision` = 'datetime' THEN `apply_end_raw` IS NOT NULL AND `apply_end_date` IS NULL AND `apply_end_at` IS NOT NULL
      ELSE FALSE
    END = TRUE),
  CONSTRAINT `ck_program_sessions_order_date` CHECK (`apply_start_date` IS NULL OR `apply_end_date` IS NULL OR `apply_start_date` <= `apply_end_date`),
  CONSTRAINT `ck_program_sessions_order_at` CHECK (`apply_start_at` IS NULL OR `apply_end_at` IS NULL OR `apply_start_at` <= `apply_end_at`)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='프로그램 세부 모집 단위';

-- 26. 프로그램 이미지·첨부
CREATE TABLE `program_assets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `revision_id` BIGINT UNSIGNED NOT NULL,
  `asset_key` VARCHAR(128) COLLATE utf8mb4_0900_as_cs NOT NULL,
  `kind` ENUM('IMAGE', 'ATTACHMENT') CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `sort_order` INT NOT NULL,
  `source_url` TEXT NULL,
  `object_key` VARCHAR(1024) NULL,
  `storage_status` ENUM('REMOTE_ONLY', 'STORED', 'FAILED') CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'REMOTE_ONLY',
  `filename` VARCHAR(512) NULL,
  `alt_text` TEXT NULL,
  `mime_type` VARCHAR(128) NULL,
  `sha256` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `size_bytes` BIGINT UNSIGNED NULL,
  `width` INT NULL,
  `height` INT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_program_assets_01` (`revision_id`, `asset_key`),
  KEY `idx_program_assets_02` (`revision_id`, `sort_order`),
  KEY `idx_program_assets_03` (`sha256`),
  CONSTRAINT `ck_program_assets_sort_order` CHECK (`sort_order` >= 0),
  CONSTRAINT `ck_program_assets_width` CHECK (`width` >= 0),
  CONSTRAINT `ck_program_assets_height` CHECK (`height` >= 0)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='프로그램 이미지·첨부';

-- 27. 프로그램 목적별 대상 학년
CREATE TABLE `program_target_grades` (
  `revision_id` BIGINT UNSIGNED NOT NULL,
  `purpose` ENUM('REQUIRED', 'PREFERRED', 'RECOMMENDED') CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `grade` ENUM('YEAR_1', 'YEAR_2', 'YEAR_3', 'YEAR_4', 'OTHER') CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `basis_json` JSON NOT NULL COMMENT 'Paths in this revision public source metadata, evidence and mapping rationale; no invented AI output.',
  PRIMARY KEY (`revision_id`, `purpose`, `grade`),
  KEY `idx_program_target_grades_01` (`grade`, `purpose`, `revision_id`)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='프로그램 목적별 대상 학년';

-- 28. 프로그램 목적별 대상 소속
CREATE TABLE `program_target_units` (
  `revision_id` BIGINT UNSIGNED NOT NULL,
  `purpose` ENUM('REQUIRED', 'PREFERRED', 'RECOMMENDED') CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `academic_unit_id` BIGINT UNSIGNED NOT NULL,
  `include_descendants` BOOLEAN NOT NULL DEFAULT FALSE,
  `basis_json` JSON NOT NULL COMMENT 'Public-source basis for unit/purpose/descendant mapping. Session-only conditions cannot restrict the whole program.',
  PRIMARY KEY (`revision_id`, `purpose`, `academic_unit_id`),
  KEY `idx_program_target_units_01` (`academic_unit_id`, `purpose`, `revision_id`),
  CONSTRAINT `ck_program_target_units_include_descendants` CHECK (`include_descendants` IN (0, 1))
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='프로그램 목적별 대상 소속';

-- 29. 프로그램 북마크
CREATE TABLE `user_program_bookmarks` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `program_id` BIGINT UNSIGNED NOT NULL,
  `deadline_reminder_enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`, `program_id`),
  KEY `idx_user_program_bookmarks_01` (`user_id`, `created_at`),
  KEY `idx_user_program_bookmarks_02` (`program_id`),
  CONSTRAINT `ck_user_program_bookmarks_reminder` CHECK (`deadline_reminder_enabled` IN (0, 1))
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='프로그램 북마크';

-- 30. 사용자별 마감 알림 설정
CREATE TABLE `user_notification_settings` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `deadline_in_app_enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `deadline_push_enabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`),
  CONSTRAINT `ck_user_notification_settings_in_app` CHECK (`deadline_in_app_enabled` IN (0, 1)),
  CONSTRAINT `ck_user_notification_settings_push` CHECK (`deadline_push_enabled` IN (0, 1))
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='마감 알림 채널 설정; 푸시는 명시적 동의 후 활성화';

-- 31. 브라우저별 웹 푸시 구독
CREATE TABLE `web_push_subscriptions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `endpoint` TEXT NOT NULL COMMENT 'Sensitive push capability URL. Never expose or log; validate HTTPS and provider allowlist before use.',
  `endpoint_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'SHA-256 of exact endpoint UTF-8 bytes, not a lowercased URL.',
  `p256dh` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `auth` VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'Browser subscription encryption secret, not a login JWT.',
  `device_label` VARCHAR(100) NULL,
  `expiration_at` DATETIME(3) NULL,
  `revoked_at` DATETIME(3) NULL,
  `revoke_reason` VARCHAR(64) NULL,
  `last_seen_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_web_push_subscriptions_01` (`endpoint_hash`),
  UNIQUE KEY `uq_web_push_subscriptions_02` (`id`, `user_id`),
  KEY `idx_web_push_subscriptions_03` (`user_id`, `revoked_at`, `expiration_at`),
  CONSTRAINT `ck_web_push_subscriptions_keys` CHECK (CHAR_LENGTH(`endpoint`) > 0 AND CHAR_LENGTH(`p256dh`) > 0 AND CHAR_LENGTH(`auth`) > 0)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='회원 소유 브라우저 푸시 구독; 계정 간 소유자 UPDATE 금지';

-- 32. 마감 하루 전 알림 예약
-- Exactly one complete notice/summary OR program/revision pair is required by the service.
-- Composite FKs enforce ownership within each pair. JSON source references are validated by the service.
CREATE TABLE `deadline_reminders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `notice_id` BIGINT UNSIGNED NULL,
  `notice_summary_id` BIGINT UNSIGNED NULL,
  `program_id` BIGINT UNSIGNED NULL,
  `program_revision_id` BIGINT UNSIGNED NULL,
  `dedup_key` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'SHA-256 canonical D1 event identity: content kind/id and normalized precision/value; excludes revision, bookmark time and channel.',
  `policy_version` VARCHAR(32) NOT NULL COMMENT 'Scheduling contract, initially deadline-d1-v1; NOT part of dedup_key.',
  `deadline_precision` ENUM('date', 'datetime') CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `deadline_date` DATE NULL,
  `deadline_at` DATETIME(3) NULL,
  `source_refs_json` JSON NOT NULL COMMENT 'Non-empty validated list of period/item/session or program-root deadline references in the selected version.',
  `scheduled_at` DATETIME(3) NOT NULL,
  `deliver_before` DATETIME(3) NOT NULL COMMENT 'Exclusive retry/send cutoff; policy timestamp, NOT an invented source deadline.',
  `status` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED') CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'PENDING',
  `next_attempt_at` DATETIME(3) NOT NULL,
  `attempt_count` INT NOT NULL DEFAULT 0,
  `lock_token` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `locked_until` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL COMMENT 'Notification and push outbox creation committed; not proof of push delivery.',
  `cancelled_at` DATETIME(3) NULL,
  `cancel_reason` VARCHAR(64) NULL,
  `last_error` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_deadline_reminders_01` (`user_id`, `dedup_key`),
  UNIQUE KEY `uq_deadline_reminders_02` (`id`, `user_id`),
  KEY `idx_deadline_reminders_03` (`status`, `next_attempt_at`),
  KEY `idx_deadline_reminders_04` (`status`, `locked_until`),
  KEY `idx_deadline_reminders_05` (`notice_id`, `notice_summary_id`, `status`),
  KEY `idx_deadline_reminders_06` (`program_id`, `program_revision_id`, `status`),
  CONSTRAINT `ck_deadline_reminders_precision` CHECK (CASE
      WHEN `deadline_precision` = 'date' THEN `deadline_date` IS NOT NULL AND `deadline_at` IS NULL
      WHEN `deadline_precision` = 'datetime' THEN `deadline_date` IS NULL AND `deadline_at` IS NOT NULL
      ELSE FALSE
    END = TRUE),
  CONSTRAINT `ck_deadline_reminders_window` CHECK (`scheduled_at` < `deliver_before` AND (`deadline_at` IS NULL OR `deliver_before` <= `deadline_at`)),
  CONSTRAINT `ck_deadline_reminders_attempts` CHECK (`attempt_count` >= 0),
  CONSTRAINT `ck_deadline_reminders_next_attempt` CHECK (`next_attempt_at` >= `scheduled_at`),
  CONSTRAINT `ck_deadline_reminders_lease` CHECK (CASE
      WHEN `status` = 'PROCESSING' THEN `lock_token` IS NOT NULL AND `locked_until` IS NOT NULL
      ELSE `lock_token` IS NULL AND `locked_until` IS NULL
    END = TRUE),
  CONSTRAINT `ck_deadline_reminders_terminal` CHECK (CASE
      WHEN `status` = 'COMPLETED' THEN `completed_at` IS NOT NULL AND `cancelled_at` IS NULL AND `cancel_reason` IS NULL
      WHEN `status` = 'CANCELLED' THEN `completed_at` IS NULL AND `cancelled_at` IS NOT NULL AND `cancel_reason` IS NOT NULL
      ELSE `completed_at` IS NULL AND `cancelled_at` IS NULL AND `cancel_reason` IS NULL
    END = TRUE)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='회원·콘텐츠·마감별 D-1 작업; 같은 마감의 복수 경로는 한 알림으로 묶음';

-- 33. 알림함 및 공통 알림 내용
CREATE TABLE `notifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `reminder_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `body` TEXT NOT NULL,
  `in_app_visible` BOOLEAN NOT NULL,
  `read_at` DATETIME(3) NULL,
  `hidden_at` DATETIME(3) NULL COMMENT 'User dismissal; retain row for idempotency, not a hard DELETE.',
  `invalidated_at` DATETIME(3) NULL COMMENT 'Source deadline changed/removed or content hidden; cancel unsent push and mark stale in the inbox.',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notifications_01` (`reminder_id`),
  UNIQUE KEY `uq_notifications_02` (`id`, `user_id`),
  KEY `idx_notifications_03` (`user_id`, `in_app_visible`, `hidden_at`, `created_at`),
  KEY `idx_notifications_04` (`user_id`, `in_app_visible`, `hidden_at`, `read_at`, `created_at`),
  CONSTRAINT `ck_notifications_visible` CHECK (`in_app_visible` IN (0, 1)),
  CONSTRAINT `ck_notifications_read_at` CHECK (`read_at` IS NULL OR `read_at` >= `created_at`)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='예약당 하나의 알림; 푸시 전용이면 in_app_visible=false';

-- 34. 구독별 웹 푸시 발송 상태 및 재시도
CREATE TABLE `notification_push_deliveries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `notification_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `subscription_id` BIGINT UNSIGNED NOT NULL,
  `status` ENUM('PENDING', 'PROCESSING', 'RETRY_WAIT', 'ACCEPTED', 'FAILED', 'CANCELLED', 'EXPIRED') CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'PENDING',
  `attempt_count` INT NOT NULL DEFAULT 0,
  `next_attempt_at` DATETIME(3) NOT NULL,
  `lock_token` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `locked_until` DATETIME(3) NULL,
  `accepted_at` DATETIME(3) NULL COMMENT 'Push service accepted the request, NOT device display or user read.',
  `last_http_status` INT NULL,
  `last_error_code` VARCHAR(64) NULL,
  `last_error_message` TEXT NULL COMMENT 'Sanitized diagnostics only; no endpoint/auth/JWT.',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notification_push_deliveries_01` (`notification_id`, `subscription_id`),
  KEY `idx_notification_push_deliveries_02` (`status`, `next_attempt_at`),
  KEY `idx_notification_push_deliveries_03` (`status`, `locked_until`),
  KEY `idx_notification_push_deliveries_04` (`subscription_id`, `user_id`, `status`),
  KEY `idx_notification_push_deliveries_05` (`notification_id`, `user_id`),
  CONSTRAINT `ck_notification_push_deliveries_attempts` CHECK (`attempt_count` >= 0),
  CONSTRAINT `ck_notification_push_deliveries_http` CHECK (`last_http_status` BETWEEN 100 AND 599),
  CONSTRAINT `ck_notification_push_deliveries_lease` CHECK (CASE
      WHEN `status` = 'PROCESSING' THEN `lock_token` IS NOT NULL AND `locked_until` IS NOT NULL
      ELSE `lock_token` IS NULL AND `locked_until` IS NULL
    END = TRUE),
  CONSTRAINT `ck_notification_push_deliveries_accepted` CHECK (CASE
      WHEN `status` = 'ACCEPTED' THEN `accepted_at` IS NOT NULL
      ELSE `accepted_at` IS NULL
    END = TRUE)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci
  COMMENT='알림·브라우저 구독별 발송; 외부 전송 exactly-once 보장 아님';

-- 2. 외래 키: 모든 테이블이 존재한 뒤 연결합니다. FK 검사는 계속 활성 상태입니다.
-- RESTRICT/NO ACTION 및 SET NULL/CASCADE는 기존 v2.1 관계를 유지합니다.
-- 복합 FK는 다른 공지/프로그램의 원문·요약·분석을 연결하지 못하도록 합니다.
-- nullable 복합 FK는 포인터를 NULL로 둔 초기 본체 삽입을 허용합니다.

ALTER TABLE `user_profiles`
  ADD CONSTRAINT `fk_user_profiles_01`
  FOREIGN KEY (`user_id`)
  REFERENCES `users` (`id`)
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `user_sessions`
  ADD CONSTRAINT `fk_user_sessions_01`
  FOREIGN KEY (`user_id`)
  REFERENCES `users` (`id`)
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `academic_units`
  ADD CONSTRAINT `fk_academic_units_01`
  FOREIGN KEY (`parent_id`)
  REFERENCES `academic_units` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `user_academic_units`
  ADD CONSTRAINT `fk_user_academic_units_01`
  FOREIGN KEY (`user_id`)
  REFERENCES `users` (`id`)
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `user_academic_units`
  ADD CONSTRAINT `fk_user_academic_units_02`
  FOREIGN KEY (`academic_unit_id`)
  REFERENCES `academic_units` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `user_topics`
  ADD CONSTRAINT `fk_user_topics_01`
  FOREIGN KEY (`user_id`)
  REFERENCES `users` (`id`)
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `user_topics`
  ADD CONSTRAINT `fk_user_topics_02`
  FOREIGN KEY (`topic_id`)
  REFERENCES `topics` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `crawl_runs`
  ADD CONSTRAINT `fk_crawl_runs_01`
  FOREIGN KEY (`source_id`)
  REFERENCES `sources` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `crawl_records`
  ADD CONSTRAINT `fk_crawl_records_01`
  FOREIGN KEY (`crawl_run_id`)
  REFERENCES `crawl_runs` (`id`)
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `crawl_records`
  ADD CONSTRAINT `fk_crawl_records_02`
  FOREIGN KEY (`notice_id`)
  REFERENCES `notices` (`id`)
  ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE `crawl_records`
  ADD CONSTRAINT `fk_crawl_records_03`
  FOREIGN KEY (`program_id`)
  REFERENCES `programs` (`id`)
  ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE `notices`
  ADD CONSTRAINT `fk_notices_01`
  FOREIGN KEY (`source_id`)
  REFERENCES `sources` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `notices`
  ADD CONSTRAINT `fk_notices_02`
  FOREIGN KEY (`id`, `current_revision_id`)
  REFERENCES `notice_revisions` (`notice_id`, `id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE `notices`
  ADD CONSTRAINT `fk_notices_03`
  FOREIGN KEY (`id`, `published_summary_id`)
  REFERENCES `notice_summaries` (`notice_id`, `id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE `notice_revisions`
  ADD CONSTRAINT `fk_notice_revisions_01`
  FOREIGN KEY (`notice_id`)
  REFERENCES `notices` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `notice_assets`
  ADD CONSTRAINT `fk_notice_assets_01`
  FOREIGN KEY (`revision_id`)
  REFERENCES `notice_revisions` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `notice_analyses`
  ADD CONSTRAINT `fk_notice_analyses_01`
  FOREIGN KEY (`revision_id`)
  REFERENCES `notice_revisions` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `notice_summaries`
  ADD CONSTRAINT `fk_notice_summaries_01`
  FOREIGN KEY (`notice_id`, `revision_id`)
  REFERENCES `notice_revisions` (`notice_id`, `id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `notice_summaries`
  ADD CONSTRAINT `fk_notice_summaries_02`
  FOREIGN KEY (`analysis_id`, `revision_id`)
  REFERENCES `notice_analyses` (`id`, `revision_id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `notice_summaries`
  ADD CONSTRAINT `fk_notice_summaries_03`
  FOREIGN KEY (`category_id`)
  REFERENCES `notice_categories` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `notice_summaries`
  ADD CONSTRAINT `fk_notice_summaries_04`
  FOREIGN KEY (`primary_topic_id`)
  REFERENCES `topics` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `notice_summaries`
  ADD CONSTRAINT `fk_notice_summaries_05`
  FOREIGN KEY (`reviewed_by`)
  REFERENCES `users` (`id`)
  ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE `notice_periods`
  ADD CONSTRAINT `fk_notice_periods_01`
  FOREIGN KEY (`summary_id`)
  REFERENCES `notice_summaries` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `notice_items`
  ADD CONSTRAINT `fk_notice_items_01`
  FOREIGN KEY (`summary_id`)
  REFERENCES `notice_summaries` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `notice_target_grades`
  ADD CONSTRAINT `fk_notice_target_grades_01`
  FOREIGN KEY (`summary_id`)
  REFERENCES `notice_summaries` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `notice_target_units`
  ADD CONSTRAINT `fk_notice_target_units_01`
  FOREIGN KEY (`summary_id`)
  REFERENCES `notice_summaries` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `notice_target_units`
  ADD CONSTRAINT `fk_notice_target_units_02`
  FOREIGN KEY (`academic_unit_id`)
  REFERENCES `academic_units` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `user_notice_bookmarks`
  ADD CONSTRAINT `fk_user_notice_bookmarks_01`
  FOREIGN KEY (`user_id`)
  REFERENCES `users` (`id`)
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `user_notice_bookmarks`
  ADD CONSTRAINT `fk_user_notice_bookmarks_02`
  FOREIGN KEY (`notice_id`)
  REFERENCES `notices` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `programs`
  ADD CONSTRAINT `fk_programs_01`
  FOREIGN KEY (`source_id`)
  REFERENCES `sources` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `programs`
  ADD CONSTRAINT `fk_programs_02`
  FOREIGN KEY (`id`, `current_revision_id`)
  REFERENCES `program_revisions` (`program_id`, `id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE `program_revisions`
  ADD CONSTRAINT `fk_program_revisions_01`
  FOREIGN KEY (`program_id`)
  REFERENCES `programs` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `program_revisions`
  ADD CONSTRAINT `fk_program_revisions_02`
  FOREIGN KEY (`category_id`)
  REFERENCES `program_categories` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `program_revisions`
  ADD CONSTRAINT `fk_program_revisions_03`
  FOREIGN KEY (`primary_topic_id`)
  REFERENCES `topics` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `program_sessions`
  ADD CONSTRAINT `fk_program_sessions_01`
  FOREIGN KEY (`revision_id`)
  REFERENCES `program_revisions` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `program_assets`
  ADD CONSTRAINT `fk_program_assets_01`
  FOREIGN KEY (`revision_id`)
  REFERENCES `program_revisions` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `program_target_grades`
  ADD CONSTRAINT `fk_program_target_grades_01`
  FOREIGN KEY (`revision_id`)
  REFERENCES `program_revisions` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `program_target_units`
  ADD CONSTRAINT `fk_program_target_units_01`
  FOREIGN KEY (`revision_id`)
  REFERENCES `program_revisions` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `program_target_units`
  ADD CONSTRAINT `fk_program_target_units_02`
  FOREIGN KEY (`academic_unit_id`)
  REFERENCES `academic_units` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `user_program_bookmarks`
  ADD CONSTRAINT `fk_user_program_bookmarks_01`
  FOREIGN KEY (`user_id`)
  REFERENCES `users` (`id`)
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `user_program_bookmarks`
  ADD CONSTRAINT `fk_user_program_bookmarks_02`
  FOREIGN KEY (`program_id`)
  REFERENCES `programs` (`id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `user_notification_settings`
  ADD CONSTRAINT `fk_user_notification_settings_01`
  FOREIGN KEY (`user_id`)
  REFERENCES `users` (`id`)
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `web_push_subscriptions`
  ADD CONSTRAINT `fk_web_push_subscriptions_01`
  FOREIGN KEY (`user_id`)
  REFERENCES `users` (`id`)
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `deadline_reminders`
  ADD CONSTRAINT `fk_deadline_reminders_01`
  FOREIGN KEY (`user_id`)
  REFERENCES `users` (`id`)
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `deadline_reminders`
  ADD CONSTRAINT `fk_deadline_reminders_02`
  FOREIGN KEY (`notice_id`, `notice_summary_id`)
  REFERENCES `notice_summaries` (`notice_id`, `id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `deadline_reminders`
  ADD CONSTRAINT `fk_deadline_reminders_03`
  FOREIGN KEY (`program_id`, `program_revision_id`)
  REFERENCES `program_revisions` (`program_id`, `id`)
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE `notifications`
  ADD CONSTRAINT `fk_notifications_01`
  FOREIGN KEY (`reminder_id`, `user_id`)
  REFERENCES `deadline_reminders` (`id`, `user_id`)
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `notification_push_deliveries`
  ADD CONSTRAINT `fk_notification_push_deliveries_01`
  FOREIGN KEY (`notification_id`, `user_id`)
  REFERENCES `notifications` (`id`, `user_id`)
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `notification_push_deliveries`
  ADD CONSTRAINT `fk_notification_push_deliveries_02`
  FOREIGN KEY (`subscription_id`, `user_id`)
  REFERENCES `web_push_subscriptions` (`id`, `user_id`)
  ON DELETE CASCADE ON UPDATE NO ACTION;

-- 3. 서비스 계층에서 반드시 검증할 사항 (이 파일만으로 자동 구현되지 않음)
-- * 마감 알림: 대상 notice/summary 또는 program/revision 중 정확히 한 쌍 필수.
--   nullable 복합 FK는 부분 NULL을 거절하지 않으므로 완전한 쌍 검사는 서비스 책임.
-- * 현재 공개/검증 버전, 신청 마감 근거, 북마크·회원·채널 설정을 예약/발송 시 재검사.
-- * 동일 마감은 버전/채널과 무관한 dedup_key로 묶고, 알림+푸시 작업 생성은 원자적 처리.
-- * claim token/lease로 워커 복구. 푸시 ACCEPTED는 사용자 수신/읽음 보장이 아님.
-- * 마감 변경·북마크 해제·푸시 해제 시 미발송 취소. 완료 알림은 삭제하지 않고 상태 표시.
-- * 상세 시간·재시도·취소·보존 규칙은 문서 17절. 초기 DDL 수정이며 DB 실행은 아님.
-- * crawl_records.notice_id/program_id 중 최대 하나만 설정, 실행 출처/콘텐츠 종류 일치.
--   해당 컬럼은 ON DELETE SET NULL FK이므로 이 조건을 CHECK로 강제하지 않습니다.
-- * origin=AI인 요약의 analysis_id 필수, HUMAN 원본과 근거 확인.
-- * 공개 포인터는 현재 원문과 같은 버전이며 VALID + APPROVED인 요약만 가리킴.
-- * UNKNOWN/ALL은 REQUIRED 행 없음, RESTRICTED는 REQUIRED 행 하나 이상.
-- * PREFERRED/RECOMMENDED는 필수 제한으로 사용하지 않음. 모든 목적별 근거 검증.
-- * 조건과 해당 예외를 함께 검토. 중복/반대 표현에 예외가 빠지면 검토 필요로 유지.
-- * 프로필 학년별 필수 슬롯, 관심 분야 개수, 소속 계층 순환 및 계정별 권한 검사.
-- * 날짜와 시각이 혼합된 기간 순서는 한국 달력일 기준으로 추가 검증.
-- * JSON의 세부 스키마/버전과 기간·대상 관계 투영이 일치하는지 검증.
-- * 학년·소속 UNKNOWN을 신청 불가로 바꾸지 않음. 최종 지원 자격을 자동 보증하지 않음.
-- * 검토자 FK는 회원 삭제 시 NULL이 될 수 있으므로 검토 이력/시각은 보존.
-- * 기존 DB에 직접 재실행하지 말고, 향후 Prisma 도입 시 초기 기준선 또는
--   Prisma가 생성하는 초기 마이그레이션 중 한 경로를 선택해 중복 생성 방지.
