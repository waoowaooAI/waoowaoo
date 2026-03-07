-- ============================================================================
-- waoowaoo 设置中心 API 配置 Seed Data
-- ============================================================================
-- 使用说明：
--   1. 确保 API_ENCRYPTION_KEY 环境变量设置为: waoowaoo-opensource-fixed-key-2026
--      （与 docker-compose.yml 和 .env.example 中的默认值一致）
--   2. 此种子数据会为指定用户创建/更新完整的 API 配置，包括：
--      - 所有 Provider（含加密的 API Key）
--      - 所有 Model（53个模型，覆盖 LLM/Image/Video/Audio/LipSync）
--      - 默认模型选择
--      - Capability 默认参数
--   3. 执行方式：
--      mysql -h 127.0.0.1 -P 13306 -u root -pwaoowaoo123 waoowaoo < prisma/seed.sql
--
-- ⚠️  重要提醒：
--   - API Key 使用 AES-256-GCM 加密，密钥从 API_ENCRYPTION_KEY 派生
--   - 必须保证目标环境的 API_ENCRYPTION_KEY 与加密时一致，否则无法解密
--   - 此文件包含敏感信息（加密的 API Key），请勿公开提交到公开仓库
-- ============================================================================

-- 替换为目标用户的 userId（可通过 SELECT id FROM user WHERE name='<手机号>'; 查询）
SET @target_user_id = (SELECT id FROM user LIMIT 1);

-- 如果找不到用户则中止
SELECT IF(@target_user_id IS NULL, 'ERROR: 未找到任何用户，请先注册登录后再执行此脚本', CONCAT('目标用户: ', @target_user_id)) AS status;

-- Upsert: 如果用户已有配置则更新，否则插入
INSERT INTO user_preferences (
  id,
  userId,
  analysisModel,
  characterModel,
  locationModel,
  storyboardModel,
  editModel,
  videoModel,
  lipSyncModel,
  videoRatio,
  videoResolution,
  artStyle,
  ttsRate,
  imageResolution,
  customProviders,
  customModels,
  capabilityDefaults,
  createdAt,
  updatedAt
) VALUES (
  UUID(),
  @target_user_id,
  'openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0::gpt-5.2',
  'gemini-compatible:7023dae7-9124-4895-abb4-b966e5a00534::gemini-3.1-flash-image-preview',
  'openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0::gpt-image-1.5-all',
  'gemini-compatible:7023dae7-9124-4895-abb4-b966e5a00534::gemini-3.1-flash-image-preview',
  'gemini-compatible:7023dae7-9124-4895-abb4-b966e5a00534::gemini-3.1-flash-image-preview',
  'openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0::veo3.1-4k',
  'fal::fal-ai/kling-video/lipsync/audio-to-video',
  '9:16',
  '1080p',
  'realistic',
  '+100%',
  '2K',
  '[{"id":"ark","name":"火山引擎 Ark","apiKey":"af777ef068f9f5d89de1cd6913e7e8a1:380a08716d627e587e105a60708f632a:ff19f2c1a4ce56e5f09848701b95998eb1ab5beb0207bbff74b00077dd41ee843624812d"},{"id":"google","name":"Google AI Studio","apiKey":"0ff5ccc1305d36968936ba84022b7230:fa1b5b7099228606968c3cc9f13763cb:f010dab761bfd5b022954dc4c1340aac2043f76bbef26d34b6915b7a1e5e7a7da02c4fde301f44"},{"id":"openrouter","name":"OpenRouter","baseUrl":"https://openrouter.ai/api/v1","apiKey":"5a458e0e4f3078adde030872ca0f8c76:8ac2631532d445f9283103489234cb41:a0886c0d2ea9d7717c5e24cf9a3edf7010da0537d301c48d44b1f4cfd564d666fc3116b8a207b3915d58fc28a9334c58af1decc6963501ca94062a07b9b156b7145d9dc7df156ea62b"},{"id":"minimax","name":"海螺 MiniMax","apiKey":"cd478d3206d51d2202733d53af36545f:c701cbc753ba003b6a7d8497ddfe1af7:94173b1add028a8992e1869c2179dbca11067f9b8fe862c6ac659513a99064b80a55e1be895c4b59df8d54c7f85febaf10c55a6f38bd1760507c46857f3f86e38c0619106b714405e48db67a3988563f5e701fed2fa3fe6cdd65a5a0984a5eec5f42884bf1f6e3f9548d7f40f0a073d42df8079cb36649dcdb7dd251bd4f"},{"id":"vidu","name":"生数科技 Vidu"},{"id":"fal","name":"FAL","apiKey":"ff46a21e20c361c17d26559b14fa73af:b01c988627f4a1f4238c588e10687c5b:e41aa7be700980b0a8bca296d412c81adfe4a419b12b37436f826aa18e84d167e215e25a6ee5a2787a3827c1e76b0cc63e783b11f5d32bd5b2a6e633e9d31f444bdac69961"},{"id":"qwen","name":"Qwen","apiKey":"68aaecff41230b1476c583cd36f24e25:87575eba9d9ac1295acbb373602158b9:a28c360ecbbebb887ef49094df56cd5ca11d66a62b3fbc61dc48dbc98fc2abef04ce52"},{"id":"gemini-compatible:7023dae7-9124-4895-abb4-b966e5a00534","name":"yunwu","baseUrl":"https://yunwu.ai","apiKey":"f70d1f9b8c1b8e531e20bd29704ba8ac:0bc9cf65ebfdb5b835198eda1d6a8e1d:ab5ef06b20d7896a17481bb4876a8f409f2aba4688774ea781a3bdc01a42243ec70b55d77dc25a397989d88d02ecc221212299"},{"id":"openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0","name":"yunwu","baseUrl":"https://yunwu.ai","apiMode":"openai-official","apiKey":"70ac28b7d7b16caec92e29e03b2b1581:8d6413eebca1da054911a295455f7549:f39e290a1e48eb951868d3a91378a665b818c5228d951cfa96293985ff6f23b4319bf8668c5c5d2ae6556bfa78218a9033d1a0"},{"id":"openai-compatible:6dccfc93-ff9a-4247-aea8-d82eed121ea3","name":"yunwu","baseUrl":"https://yunwu.ai","apiMode":"openai-official","apiKey":"8b32e6e910634865a6dda2b91078e8d6:dc1846f5bf1fd942ff24640c530da875:69d769c95f7feb461fbca2cd70daaf576f9451a6bb0b6f08dabe28fe16f9bab0f96d4d7c3fcd91bdab45dfd5a8178c85955527"}]',
  '[{"modelId":"google/gemini-3.1-pro-preview","modelKey":"openrouter::google/gemini-3.1-pro-preview","name":"Gemini 3.1 Pro","type":"llm","provider":"openrouter","price":0},{"modelId":"google/gemini-3-pro-preview","modelKey":"openrouter::google/gemini-3-pro-preview","name":"Gemini 3 Pro","type":"llm","provider":"openrouter","price":0},{"modelId":"google/gemini-3-flash-preview","modelKey":"openrouter::google/gemini-3-flash-preview","name":"Gemini 3 Flash","type":"llm","provider":"openrouter","price":0},{"modelId":"anthropic/claude-sonnet-4.5","modelKey":"openrouter::anthropic/claude-sonnet-4.5","name":"Claude Sonnet 4.5","type":"llm","provider":"openrouter","price":0},{"modelId":"gemini-3.1-pro-preview","modelKey":"google::gemini-3.1-pro-preview","name":"Gemini 3.1 Pro","type":"llm","provider":"google","price":0},{"modelId":"gemini-3-pro-preview","modelKey":"google::gemini-3-pro-preview","name":"Gemini 3 Pro","type":"llm","provider":"google","price":0},{"modelId":"gemini-3-flash-preview","modelKey":"google::gemini-3-flash-preview","name":"Gemini 3 Flash","type":"llm","provider":"google","price":0},{"modelId":"doubao-seed-2-0-pro-260215","modelKey":"ark::doubao-seed-2-0-pro-260215","name":"Doubao Seed 2.0 Pro","type":"llm","provider":"ark","price":0},{"modelId":"doubao-seed-2-0-lite-260215","modelKey":"ark::doubao-seed-2-0-lite-260215","name":"Doubao Seed 2.0 Lite","type":"llm","provider":"ark","price":0},{"modelId":"doubao-seed-2-0-mini-260215","modelKey":"ark::doubao-seed-2-0-mini-260215","name":"Doubao Seed 2.0 Mini","type":"llm","provider":"ark","price":0},{"modelId":"banana","modelKey":"fal::banana","name":"Banana Pro","type":"image","provider":"fal","price":0},{"modelId":"doubao-seedream-4-5-251128","modelKey":"ark::doubao-seedream-4-5-251128","name":"Seedream 4.5","type":"image","provider":"ark","price":0},{"modelId":"doubao-seedream-4-0-250828","modelKey":"ark::doubao-seedream-4-0-250828","name":"Seedream 4.0","type":"image","provider":"ark","price":0},{"modelId":"gemini-3.1-flash-image-preview","modelKey":"google::gemini-3.1-flash-image-preview","name":"Nano Banana 2","type":"image","provider":"google","price":0},{"modelId":"doubao-seedance-1-0-pro-fast-251015","modelKey":"ark::doubao-seedance-1-0-pro-fast-251015","name":"Seedance 1.0 Pro Fast","type":"video","provider":"ark","price":0},{"modelId":"doubao-seedance-1-0-lite-i2v-250428","modelKey":"ark::doubao-seedance-1-0-lite-i2v-250428","name":"Seedance 1.0 Lite","type":"video","provider":"ark","price":0},{"modelId":"doubao-seedance-1-5-pro-251215","modelKey":"ark::doubao-seedance-1-5-pro-251215","name":"Seedance 1.5 Pro","type":"video","provider":"ark","price":0},{"modelId":"doubao-seedance-1-0-pro-250528","modelKey":"ark::doubao-seedance-1-0-pro-250528","name":"Seedance 1.0 Pro","type":"video","provider":"ark","price":0},{"modelId":"veo-3.1-generate-preview","modelKey":"google::veo-3.1-generate-preview","name":"Veo 3.1","type":"video","provider":"google","price":0},{"modelId":"veo-3.1-fast-generate-preview","modelKey":"google::veo-3.1-fast-generate-preview","name":"Veo 3.1 Fast","type":"video","provider":"google","price":0},{"modelId":"veo-3.0-generate-001","modelKey":"google::veo-3.0-generate-001","name":"Veo 3.0","type":"video","provider":"google","price":0},{"modelId":"veo-3.0-fast-generate-001","modelKey":"google::veo-3.0-fast-generate-001","name":"Veo 3.0 Fast","type":"video","provider":"google","price":0},{"modelId":"veo-2.0-generate-001","modelKey":"google::veo-2.0-generate-001","name":"Veo 2.0","type":"video","provider":"google","price":0},{"modelId":"fal-wan25","modelKey":"fal::fal-wan25","name":"Wan 2.6","type":"video","provider":"fal","price":0},{"modelId":"fal-veo31","modelKey":"fal::fal-veo31","name":"Veo 3.1","type":"video","provider":"fal","price":0},{"modelId":"fal-sora2","modelKey":"fal::fal-sora2","name":"Sora 2","type":"video","provider":"fal","price":0},{"modelId":"fal-ai/kling-video/v2.5-turbo/pro/image-to-video","modelKey":"fal::fal-ai/kling-video/v2.5-turbo/pro/image-to-video","name":"Kling 2.5 Turbo Pro","type":"video","provider":"fal","price":0},{"modelId":"fal-ai/kling-video/v3/standard/image-to-video","modelKey":"fal::fal-ai/kling-video/v3/standard/image-to-video","name":"Kling 3 Standard","type":"video","provider":"fal","price":0},{"modelId":"fal-ai/kling-video/v3/pro/image-to-video","modelKey":"fal::fal-ai/kling-video/v3/pro/image-to-video","name":"Kling 3 Pro","type":"video","provider":"fal","price":0},{"modelId":"fal-ai/index-tts-2/text-to-speech","modelKey":"fal::fal-ai/index-tts-2/text-to-speech","name":"IndexTTS 2","type":"audio","provider":"fal","price":0},{"modelId":"fal-ai/kling-video/lipsync/audio-to-video","modelKey":"fal::fal-ai/kling-video/lipsync/audio-to-video","name":"Kling Lip Sync","type":"lipsync","provider":"fal","price":0},{"modelId":"vidu-lipsync","modelKey":"vidu::vidu-lipsync","name":"Vidu Lip Sync","type":"lipsync","provider":"vidu","price":0},{"modelId":"minimax-hailuo-2.3","modelKey":"minimax::minimax-hailuo-2.3","name":"Hailuo 2.3","type":"video","provider":"minimax","price":0},{"modelId":"minimax-hailuo-2.3-fast","modelKey":"minimax::minimax-hailuo-2.3-fast","name":"Hailuo 2.3 Fast","type":"video","provider":"minimax","price":0},{"modelId":"viduq3-pro","modelKey":"vidu::viduq3-pro","name":"Vidu Q3 Pro","type":"video","provider":"vidu","price":0},{"modelId":"viduq2-pro-fast","modelKey":"vidu::viduq2-pro-fast","name":"Vidu Q2 Pro Fast","type":"video","provider":"vidu","price":0},{"modelId":"viduq2-pro","modelKey":"vidu::viduq2-pro","name":"Vidu Q2 Pro","type":"video","provider":"vidu","price":0},{"modelId":"viduq2-turbo","modelKey":"vidu::viduq2-turbo","name":"Vidu Q2 Turbo","type":"video","provider":"vidu","price":0},{"modelId":"viduq1","modelKey":"vidu::viduq1","name":"Vidu Q1","type":"video","provider":"vidu","price":0},{"modelId":"viduq1-classic","modelKey":"vidu::viduq1-classic","name":"Vidu Q1 Classic","type":"video","provider":"vidu","price":0},{"modelId":"vidu2.0","modelKey":"vidu::vidu2.0","name":"Vidu 2.0","type":"video","provider":"vidu","price":0},{"modelId":"fal-kling25","modelKey":"fal::fal-kling25","name":"Kling 2.6","type":"video","provider":"fal","price":0},{"modelId":"gemini-3-pro-image-preview","modelKey":"gemini-compatible:7023dae7-9124-4895-abb4-b966e5a00534::gemini-3-pro-image-preview","name":"Banana Pro","type":"image","provider":"gemini-compatible:7023dae7-9124-4895-abb4-b966e5a00534","price":0},{"modelId":"gemini-3.1-pro-preview","modelKey":"gemini-compatible:7023dae7-9124-4895-abb4-b966e5a00534::gemini-3.1-pro-preview","name":"Gemini 3.1 Pro","type":"llm","provider":"gemini-compatible:7023dae7-9124-4895-abb4-b966e5a00534","price":0},{"modelId":"gemini-3-flash-preview","modelKey":"gemini-compatible:7023dae7-9124-4895-abb4-b966e5a00534::gemini-3-flash-preview","name":"Gemini 3 Flash","type":"llm","provider":"gemini-compatible:7023dae7-9124-4895-abb4-b966e5a00534","price":0},{"modelId":"gemini-3-pro-preview","modelKey":"gemini-compatible:7023dae7-9124-4895-abb4-b966e5a00534::gemini-3-pro-preview","name":"Gemini 3 Pro","type":"llm","provider":"gemini-compatible:7023dae7-9124-4895-abb4-b966e5a00534","price":0},{"modelId":"qwen/qwen3.5-397b-a17b","modelKey":"openrouter::qwen/qwen3.5-397b-a17b","name":"qwen/qwen3.5-397b-a17b","type":"llm","provider":"openrouter","price":0,"customPricing":{"llm":{"inputPerMillion":3,"outputPerMillion":22}}},{"modelId":"gemini-3.1-flash-image-preview","modelKey":"gemini-compatible:7023dae7-9124-4895-abb4-b966e5a00534::gemini-3.1-flash-image-preview","name":"Nano Banana 2","type":"image","provider":"gemini-compatible:7023dae7-9124-4895-abb4-b966e5a00534","price":0},{"modelId":"claude-sonnet-4-6","modelKey":"openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0::claude-sonnet-4-6","name":"claude46","type":"llm","provider":"openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0","price":0},{"modelId":"veo_3_1-fast-4K","modelKey":"openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0::veo_3_1-fast-4K","name":"veo3.1fast","type":"video","provider":"openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0","price":0},{"modelId":"gpt-5.2","modelKey":"openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0::gpt-5.2","name":"gpt-5.2","type":"llm","provider":"openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0","price":0},{"modelId":"gpt-image-1.5-all","modelKey":"openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0::gpt-image-1.5-all","name":"gpt-image-1.5-all","type":"image","provider":"openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0","price":0},{"modelId":"veo3.1-4k","modelKey":"openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0::veo3.1-4k","name":"veo3.1-4k create","type":"video","provider":"openai-compatible:33331fb0-2806-4da6-85ff-cd2433b587d0","price":0}]',
  '{"ark::doubao-seedance-1-0-pro-fast-251015":{"duration":4},"ark::doubao-seedance-1-0-lite-i2v-250428":{"resolution":"720p"},"gemini-compatible:7023dae7-9124-4895-abb4-b966e5a00534::gemini-3-pro-image-preview":{"resolution":"2K"}}',
  NOW(),
  NOW()
)
ON DUPLICATE KEY UPDATE
  analysisModel = VALUES(analysisModel),
  characterModel = VALUES(characterModel),
  locationModel = VALUES(locationModel),
  storyboardModel = VALUES(storyboardModel),
  editModel = VALUES(editModel),
  videoModel = VALUES(videoModel),
  lipSyncModel = VALUES(lipSyncModel),
  videoRatio = VALUES(videoRatio),
  videoResolution = VALUES(videoResolution),
  artStyle = VALUES(artStyle),
  ttsRate = VALUES(ttsRate),
  imageResolution = VALUES(imageResolution),
  customProviders = VALUES(customProviders),
  customModels = VALUES(customModels),
  capabilityDefaults = VALUES(capabilityDefaults),
  updatedAt = NOW();

SELECT '✅ API 配置导入成功！请刷新设置中心页面查看。' AS result;
