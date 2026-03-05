-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."ivm_user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ivm_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_user_preference" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "analysis_model" TEXT,
    "image_model" TEXT,
    "video_model" TEXT,
    "character_model" TEXT,
    "location_model" TEXT,
    "storyboard_model" TEXT,
    "edit_model" TEXT,
    "lip_sync_model" TEXT,
    "image_resolution" TEXT,
    "api_keys" TEXT,
    "custom_models" TEXT,
    "custom_providers" TEXT,
    "capability_defaults" TEXT,
    "billing_mode" TEXT NOT NULL DEFAULT 'OFF',

    CONSTRAINT "ivm_user_preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_user_balance" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "balance" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "frozen_amount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "total_spent" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ivm_user_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_balance_freeze" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "task_id" TEXT,
    "request_id" TEXT,
    "source" TEXT,
    "metadata" TEXT,
    "idempotency_key" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ivm_balance_freeze_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_balance_transaction" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "balance_after" DECIMAL(18,6) NOT NULL,
    "description" TEXT,
    "related_id" TEXT,
    "freeze_id" TEXT,
    "operator_id" TEXT,
    "external_order_id" TEXT,
    "idempotency_key" TEXT,
    "project_id" TEXT,
    "episode_id" TEXT,
    "task_type" TEXT,
    "billing_meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ivm_balance_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "user_id" TEXT NOT NULL,
    "segment_duration" INTEGER NOT NULL DEFAULT 5,
    "episode_duration" INTEGER NOT NULL DEFAULT 60,
    "total_duration" INTEGER NOT NULL DEFAULT 600,
    "episode_count" INTEGER NOT NULL DEFAULT 10,
    "analysis_model" TEXT,
    "image_model" TEXT,
    "video_model" TEXT,
    "character_model" TEXT,
    "location_model" TEXT,
    "storyboard_model" TEXT,
    "edit_model" TEXT,
    "art_style" TEXT NOT NULL DEFAULT 'cinematic',
    "video_ratio" TEXT NOT NULL DEFAULT '9:16',
    "video_resolution" TEXT,
    "capability_overrides" TEXT,
    "novel_text" TEXT,
    "global_context" TEXT,
    "last_accessed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ivm_project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_episode" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "episode_index" INTEGER NOT NULL,
    "name" TEXT,
    "novel_text" TEXT,
    "context" TEXT,
    "audio_url" TEXT,
    "srt_content" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ivm_episode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_segment" (
    "id" TEXT NOT NULL,
    "episode_id" TEXT NOT NULL,
    "segment_index" INTEGER NOT NULL,
    "summary" TEXT,
    "content" TEXT,
    "start_time" DOUBLE PRECISION NOT NULL,
    "end_time" DOUBLE PRECISION NOT NULL,
    "location" TEXT,
    "characters" JSONB,
    "props" JSONB,
    "screenplay" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ivm_segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_character" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "profile_data" JSONB,
    "introduction" TEXT,
    "voice_preset_id" TEXT,
    "profile_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ivm_character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_character_appearance" (
    "id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "appearance_index" INTEGER NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "image_prompt" TEXT,
    "previous_image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ivm_character_appearance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_character_view" (
    "id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "view_type" TEXT NOT NULL,
    "image_url" TEXT,
    "image_prompt" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ivm_character_view_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_location" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "atmosphere" TEXT,
    "time_of_day" TEXT,
    "lighting" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ivm_location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_location_image" (
    "id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "image_index" INTEGER NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "is_selected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ivm_location_image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_location_view" (
    "id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "view_type" TEXT NOT NULL,
    "image_url" TEXT,
    "image_prompt" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ivm_location_view_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_prop" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "image_prompt" TEXT,
    "significance" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ivm_prop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_storyboard_entry" (
    "id" TEXT NOT NULL,
    "segment_id" TEXT NOT NULL,
    "entry_index" INTEGER NOT NULL,
    "start_time" DOUBLE PRECISION NOT NULL,
    "end_time" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "character_refs" JSONB,
    "sound_effect" TEXT,
    "dialogue" TEXT,
    "dialogue_speaker" TEXT,
    "dialogue_tone" TEXT,
    "image_url" TEXT,
    "image_prompt" TEXT,
    "previous_image_url" TEXT,
    "shot_type" TEXT,
    "camera_move" TEXT,
    "photography_notes" TEXT,
    "acting_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ivm_storyboard_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_voice_line" (
    "id" TEXT NOT NULL,
    "episode_id" TEXT NOT NULL,
    "line_index" INTEGER NOT NULL,
    "speaker" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "voice_preset_id" TEXT,
    "audio_url" TEXT,
    "emotion_prompt" TEXT,
    "emotion_strength" DOUBLE PRECISION,
    "matched_entry_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ivm_voice_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_segment_video" (
    "id" TEXT NOT NULL,
    "segment_id" TEXT NOT NULL,
    "video_url" TEXT,
    "video_prompt" TEXT,
    "model_key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ivm_segment_video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_timeline_project" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "project_data" JSONB,
    "render_status" TEXT,
    "output_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ivm_timeline_project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_media_object" (
    "id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "sha256" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ivm_media_object_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_task" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "episode_id" TEXT,
    "type" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "progress" DOUBLE PRECISION DEFAULT 0,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "enqueue_attempts" INTEGER NOT NULL DEFAULT 0,
    "dedupe_key" TEXT,
    "external_id" TEXT,
    "payload" JSONB,
    "result" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "last_enqueue_error" TEXT,
    "billing_info" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enqueued_at" TIMESTAMP(3),
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "heartbeat_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ivm_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_task_event" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "event_type" TEXT NOT NULL,
    "payload" JSONB,
    "seq" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ivm_task_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_usage_cost" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT,
    "api_type" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "cost" DECIMAL(18,6) NOT NULL,
    "metadata" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ivm_usage_cost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_circuit_breaker_state" (
    "id" TEXT NOT NULL,
    "model_key" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'closed',
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "last_failure_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "cooldown_until" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ivm_circuit_breaker_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_cache_entry" (
    "id" TEXT NOT NULL,
    "cache_key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ivm_cache_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_graph_run" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "workflow_type" TEXT NOT NULL,
    "task_type" TEXT,
    "task_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "input" JSONB,
    "output" JSONB,
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "ivm_graph_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_graph_step" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "step_key" TEXT NOT NULL,
    "step_title" TEXT,
    "step_index" INTEGER,
    "step_total" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "current_attempt" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ivm_graph_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_graph_step_attempt" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "step_key" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "provider" TEXT,
    "model_key" TEXT,
    "output_text" TEXT,
    "output_reasoning" TEXT,
    "usage_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ivm_graph_step_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ivm_graph_checkpoint" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "node_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "state_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ivm_graph_checkpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ivm_user_name_key" ON "public"."ivm_user"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_user_preference_user_id_key" ON "public"."ivm_user_preference"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_user_balance_user_id_key" ON "public"."ivm_user_balance"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_balance_freeze_idempotency_key_key" ON "public"."ivm_balance_freeze"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_episode_project_id_episode_index_key" ON "public"."ivm_episode"("project_id", "episode_index");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_segment_episode_id_segment_index_key" ON "public"."ivm_segment"("episode_id", "segment_index");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_character_project_id_name_key" ON "public"."ivm_character"("project_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_character_appearance_character_id_appearance_index_key" ON "public"."ivm_character_appearance"("character_id", "appearance_index");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_character_view_character_id_view_type_key" ON "public"."ivm_character_view"("character_id", "view_type");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_location_project_id_name_key" ON "public"."ivm_location"("project_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_location_image_location_id_image_index_key" ON "public"."ivm_location_image"("location_id", "image_index");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_location_view_location_id_view_type_key" ON "public"."ivm_location_view"("location_id", "view_type");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_prop_project_id_name_key" ON "public"."ivm_prop"("project_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_storyboard_entry_segment_id_entry_index_key" ON "public"."ivm_storyboard_entry"("segment_id", "entry_index");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_voice_line_episode_id_line_index_key" ON "public"."ivm_voice_line"("episode_id", "line_index");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_segment_video_segment_id_key" ON "public"."ivm_segment_video"("segment_id");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_timeline_project_project_id_key" ON "public"."ivm_timeline_project"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_media_object_public_id_key" ON "public"."ivm_media_object"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_media_object_storage_key_key" ON "public"."ivm_media_object"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_task_dedupe_key_key" ON "public"."ivm_task"("dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_task_event_task_id_seq_key" ON "public"."ivm_task_event"("task_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_circuit_breaker_state_model_key_key" ON "public"."ivm_circuit_breaker_state"("model_key");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_cache_entry_cache_key_key" ON "public"."ivm_cache_entry"("cache_key");

-- CreateIndex
CREATE INDEX "ivm_cache_entry_expires_at_idx" ON "public"."ivm_cache_entry"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_graph_step_run_id_step_key_key" ON "public"."ivm_graph_step"("run_id", "step_key");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_graph_step_attempt_run_id_step_key_attempt_key" ON "public"."ivm_graph_step_attempt"("run_id", "step_key", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "ivm_graph_checkpoint_run_id_node_key_version_key" ON "public"."ivm_graph_checkpoint"("run_id", "node_key", "version");

-- AddForeignKey
ALTER TABLE "public"."ivm_user_preference" ADD CONSTRAINT "ivm_user_preference_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."ivm_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ivm_user_balance" ADD CONSTRAINT "ivm_user_balance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."ivm_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ivm_project" ADD CONSTRAINT "ivm_project_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."ivm_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ivm_episode" ADD CONSTRAINT "ivm_episode_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."ivm_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ivm_segment" ADD CONSTRAINT "ivm_segment_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "public"."ivm_episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ivm_character" ADD CONSTRAINT "ivm_character_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."ivm_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ivm_character_appearance" ADD CONSTRAINT "ivm_character_appearance_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."ivm_character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ivm_character_view" ADD CONSTRAINT "ivm_character_view_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."ivm_character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ivm_location" ADD CONSTRAINT "ivm_location_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."ivm_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ivm_location_image" ADD CONSTRAINT "ivm_location_image_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."ivm_location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ivm_location_view" ADD CONSTRAINT "ivm_location_view_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."ivm_location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ivm_prop" ADD CONSTRAINT "ivm_prop_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."ivm_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ivm_storyboard_entry" ADD CONSTRAINT "ivm_storyboard_entry_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "public"."ivm_segment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ivm_voice_line" ADD CONSTRAINT "ivm_voice_line_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "public"."ivm_episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ivm_segment_video" ADD CONSTRAINT "ivm_segment_video_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "public"."ivm_segment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ivm_task" ADD CONSTRAINT "ivm_task_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."ivm_project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ivm_graph_step" ADD CONSTRAINT "ivm_graph_step_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."ivm_graph_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ivm_graph_step_attempt" ADD CONSTRAINT "ivm_graph_step_attempt_run_id_step_key_fkey" FOREIGN KEY ("run_id", "step_key") REFERENCES "public"."ivm_graph_step"("run_id", "step_key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ivm_graph_checkpoint" ADD CONSTRAINT "ivm_graph_checkpoint_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."ivm_graph_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- =====================================================
-- 中文注释（表 + 字段）
-- =====================================================

COMMENT ON TABLE public.ivm_user IS '用户表';
COMMENT ON TABLE public.ivm_user_preference IS '用户偏好设置表';
COMMENT ON TABLE public.ivm_user_balance IS '用户余额表';
COMMENT ON TABLE public.ivm_balance_freeze IS '余额冻结记录表';
COMMENT ON TABLE public.ivm_balance_transaction IS '余额交易流水表';
COMMENT ON TABLE public.ivm_project IS '项目主表';
COMMENT ON TABLE public.ivm_episode IS '剧集表';
COMMENT ON TABLE public.ivm_segment IS '片段表';
COMMENT ON TABLE public.ivm_character IS '角色表';
COMMENT ON TABLE public.ivm_character_appearance IS '角色外观图表';
COMMENT ON TABLE public.ivm_character_view IS '角色多视图表';
COMMENT ON TABLE public.ivm_location IS '场景表';
COMMENT ON TABLE public.ivm_location_image IS '场景图片表';
COMMENT ON TABLE public.ivm_location_view IS '场景多视图表';
COMMENT ON TABLE public.ivm_prop IS '道具表';
COMMENT ON TABLE public.ivm_storyboard_entry IS '分镜条目表';
COMMENT ON TABLE public.ivm_voice_line IS '语音台词表';
COMMENT ON TABLE public.ivm_segment_video IS '片段视频表';
COMMENT ON TABLE public.ivm_timeline_project IS '时间轴项目表';
COMMENT ON TABLE public.ivm_media_object IS '媒体对象表';
COMMENT ON TABLE public.ivm_task IS '任务表';
COMMENT ON TABLE public.ivm_task_event IS '任务事件表';
COMMENT ON TABLE public.ivm_usage_cost IS '用量成本记录表';
COMMENT ON TABLE public.ivm_circuit_breaker_state IS '熔断器状态表';
COMMENT ON TABLE public.ivm_cache_entry IS '缓存项表';
COMMENT ON TABLE public.ivm_graph_run IS '运行实例表';
COMMENT ON TABLE public.ivm_graph_step IS '运行步骤表';
COMMENT ON TABLE public.ivm_graph_step_attempt IS '步骤尝试记录表';
COMMENT ON TABLE public.ivm_graph_checkpoint IS '运行检查点表';

-- 为所有 ivm_* 表的所有字段补齐中文注释（兜底，确保无遗漏）
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name LIKE 'ivm\_%' ESCAPE '\'
  LOOP
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.%I IS %L',
      r.table_name,
      r.column_name,
      '字段（' || r.table_name || '）：' || r.column_name
    );
  END LOOP;
END $$;
